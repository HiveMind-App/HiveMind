/**
 * output-cleaner.ts — Limpia el output crudo del PTY antes de enviarlo a Supabase.
 *
 * Extrae metadata (files_read, files_written, tool_calls) y filtra ruido
 * (spinners, progress bars, tool headers, decoradores). Opcionalmente
 * resume con OpenAI si el texto limpio es muy largo.
 */

export interface CleanResult {
  cleaned: string
  files_read: string[]
  files_written: string[]
  tool_calls: { tool: string; args: string }[]
  active_file: string | null
}

// ── Regex patterns para extraer metadata ──

const READ_PATTERNS = [
  /(?:Reading|Read(?:ing)?)\s+(?:\d+\s+lines?\s+from\s+)?["""]?([^\s"""]+)["""]?/gi,
  /⏺\s+Read\s+["""]?([^\s"""]+)["""]?/gi,
  /cat\s+["""]?([^\s"""]+)["""]?/gi,
]

const WRITE_PATTERNS = [
  /(?:Wrote?\s+to|Created|Updated)\s+["""]?([^\s"""]+)["""]?/gi,
  /⏺\s+(?:Writ(?:e|ing)|Updat(?:e|ing))\s+["""]?([^\s"""]+)["""]?/gi,
]

const TOOL_PATTERN = /⏺\s+([\w_]+)\s*[\(({]/g
const TOOL_PATTERN2 = /Tool(?:\s+call)?:\s+([\w_]+)/gi

// ── Regex patterns para filtrar ruido ──

const NOISE_PATTERNS = [
  // Spinners (braille dots + loading text)
  /^[\s⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]*(?:Loading|Thinking|Generating|Searching|Analyzing|Processing|Compiling|Waiting)\.{0,3}\s*$/i,
  // Progress bars
  /^\[?[#=\-─\s]*\]?\s*\d+%/,
  // Tool execution headers (capturamos metadata arriba, aqui filtramos la linea)
  /^⏺\s+(?:Read(?:ing)?|Writ(?:e|ing)|Search(?:ing)?|Running|Executing|Updat(?:e|ing)|Creat(?:e|ing)|Delet(?:e|ing))\s/i,
  // Decorative lines (borders, separators)
  /^[─━═╔╗╚╝╠╣║│┃┌┐└┘├┤┬┴┼\-+*~]{3,}\s*$/,
  // Empty bracket/brace lines from tool output
  /^\s*[{}[\]]\s*$/,
  // ANSI leftover control chars
  /^[\x00-\x08\x0B\x0C\x0E-\x1F]+$/,
  // Line numbers from file dumps (e.g. "  42 │ code here")
  /^\s*\d+\s*[│|]\s/,
  // Token/cost lines
  /^(?:Token|Cost|Usage|Input|Output)\s*[:=]/i,
  // Gemini/Claude internal status lines
  /^(?:Model|Temperature|Top[_-]?[pk]|Max[_-]?tokens)\s*[:=]/i,
]

// Patterns that start a block to skip (until blank line or end pattern)
const BLOCK_START = /^(?:---|```|~~~|={3,}|\+{3,})\s*(?:BEGIN|START|FILE|OUTPUT)?/i
const BLOCK_END = /^(?:---|```|~~~|={3,}|\+{3,})\s*(?:END|EOF)?/i

function isFilePath(s: string): boolean {
  return /^[\/.][\w\-./]+\.\w{1,10}$/.test(s) || /^[\w\-]+(?:\/[\w\-]+)+\.\w{1,10}$/.test(s)
}

function extractMatches(text: string, patterns: RegExp[]): string[] {
  const results = new Set<string>()
  for (const pat of patterns) {
    // Reset lastIndex for global regex reuse
    pat.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pat.exec(text)) !== null) {
      const val = m[1]?.trim()
      if (val && isFilePath(val)) results.add(val)
    }
  }
  return [...results]
}

function extractToolCalls(text: string): { tool: string; args: string }[] {
  const tools: { tool: string; args: string }[] = []
  const seen = new Set<string>()
  for (const pat of [TOOL_PATTERN, TOOL_PATTERN2]) {
    pat.lastIndex = 0
    let m: RegExpExecArray | null
    while ((m = pat.exec(text)) !== null) {
      const name = m[1]
      if (!seen.has(name)) {
        seen.add(name)
        tools.push({ tool: name, args: "" })
      }
    }
  }
  return tools
}

export function cleanOutput(raw: string): CleanResult {
  // 1. Extraer metadata del texto original
  const files_read = extractMatches(raw, READ_PATTERNS)
  const files_written = extractMatches(raw, WRITE_PATTERNS)
  const tool_calls = extractToolCalls(raw)

  // 2. Filtrar lineas de ruido
  const lines = raw.split("\n")
  const kept: string[] = []
  let inBlock = false
  let consecutiveBlanks = 0

  for (const line of lines) {
    // Block skip logic
    if (!inBlock && BLOCK_START.test(line)) {
      inBlock = true
      continue
    }
    if (inBlock) {
      if (BLOCK_END.test(line) || line.trim() === "") inBlock = false
      continue
    }

    // Check noise patterns
    if (NOISE_PATTERNS.some((p) => p.test(line))) continue

    // Collapse consecutive blank lines
    if (line.trim() === "") {
      consecutiveBlanks++
      if (consecutiveBlanks <= 1) kept.push("")
      continue
    }
    consecutiveBlanks = 0
    kept.push(line)
  }

  const cleaned = kept.join("\n").trim()

  // 3. Determine active file
  const active_file =
    files_written[files_written.length - 1] ??
    files_read[files_read.length - 1] ??
    null

  return { cleaned, files_read, files_written, tool_calls, active_file }
}

/**
 * Usa OpenAI gpt-4o-mini para resumir el output largo en 2-4 oraciones.
 * Timeout de 5s. Si falla, devuelve null (el caller usa el cleaned original).
 */
export async function summarizeWithAI(
  text: string,
  apiKey: string,
): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 5000)

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        max_tokens: 200,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Extrae SOLO lo que el agente IA decidio, hizo y respondio. 2-4 oraciones concisas. Sin detalles de herramientas internas, lecturas de archivos ni formateo. En el mismo idioma que el texto.",
          },
          { role: "user", content: text.slice(0, 4000) },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) return null
    const json = (await res.json()) as {
      choices?: { message?: { content?: string } }[]
    }
    return json.choices?.[0]?.message?.content?.trim() || null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}
