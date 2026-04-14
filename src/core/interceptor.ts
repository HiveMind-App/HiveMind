import pty, { type IPty } from "@lydell/node-pty"
import stripAnsi from "strip-ansi"
import { randomUUID } from "node:crypto"
import { spawnSync } from "node:child_process"
import { type SupabaseClient } from "@supabase/supabase-js"
import { type HiveMindConfig } from "../config.js"
import { brand } from "../brand.js"
import { log } from "./logger.js"
import { cleanOutput, summarizeWithAI } from "./output-cleaner.js"

interface Options {
  cfg: HiveMindConfig
  supabase: SupabaseClient
  command?: string
  args?: string[]
  /** OpenAI API key del proyecto (para resumir output largo). */
  openaiKey?: string
  /** Callback que drena los eventos acumulados del Realtime + poll periodico. */
  getContextUpdates?: () => string[]
  /** Callback que drena eventos URGENTES (conflictos) para inyectar entre turnos. */
  getUrgentUpdates?: () => string[]
  /** Callback para actualizar el estado del agente local (archivos activos). */
  onFilesChanged?: (files: string[], intent: string) => void
}

interface PendingTurn {
  prompt: string
  startedAt: number
  buf: string
}

function quoteArg(s: string): string {
  if (/^[A-Za-z0-9_\-./]+$/.test(s)) return s
  return `'${s.replace(/'/g, "'\\''")}'`
}

/**
 * Wrapper PTY del Gemini CLI oficial usando @lydell/node-pty, que si compila
 * contra Node 25 (el node-pty clasico se quedo en engines <25).
 *
 * Lanzamos a traves del shell del usuario para evitar problemas con shebangs
 * raros (env -S, scripts node, aliases, etc.). El binario oficial de gemini
 * usa "#!/usr/bin/env -S node --no-warnings=DEP0040" que no sobrevive a un
 * spawn directo.
 *
 * Heuristica de turns:
 *  - currentPrompt acumula lo que el user teclea antes de Enter.
 *  - Al pulsar Enter, si el prompt no esta vacio, empezamos a buffear stdout
 *    del hijo hasta que pasen 2.5s sin nuevos datos -> flush del turn.
 *  - Si el user manda un segundo Enter antes del flush, se cierra el turn
 *    anterior y empieza uno nuevo.
 */
export async function runInterceptor({ cfg, supabase, command, args, openaiKey, getContextUpdates, getUrgentUpdates, onFilesChanged }: Options): Promise<number> {
  const isWindows = process.platform === "win32"
  const bin = command ?? process.env.GEMINI_BIN ?? "gemini"

  // En Windows, npm instala binarios como .cmd — resolvemos la ruta real
  const whichCmd = isWindows ? "where" : "which"
  const which = spawnSync(whichCmd, [bin], { encoding: "utf8", shell: isWindows })
  if (which.status !== 0 || !which.stdout.trim()) {
    log.error(`No encuentro el binario "${bin}" en tu PATH.`)
    log.dim("HiveMind envuelve un CLI de IA existente — necesita uno instalado.")
    log.dim("Opciones rapidas:")
    log.dim("  · Gemini CLI oficial:  npm install -g @google/gemini-cli")
    log.dim("  · Otro CLI compatible: GEMINI_BIN=<path> hivemind run")
    log.dim("  · Modo dry-run sin LLM: GEMINI_BIN=bash hivemind run  (debug)")
    return 1
  }
  // where puede devolver varias lineas, tomamos la primera
  const resolvedBin = which.stdout.trim().split(/\r?\n/)[0]

  const sessionId = randomUUID()
  log.info(
    `Lanzando ${brand.accent(bin)} (session ${brand.dim(sessionId.slice(0, 8))}) — ${brand.dim(
      "todo lo que hablas con Gemini se sincroniza con HiveMind."
    )}`
  )
  log.dim("Pulsa Ctrl-C en cualquier momento para salir.")
  console.log()

  let term: IPty
  try {
    if (isWindows) {
      // En Windows usamos cmd /c para lanzar .cmd scripts correctamente
      // y evitar el error "Cannot create process, error code: 2"
      term = pty.spawn("cmd.exe", ["/c", resolvedBin, ...(args ?? [])], {
        name: "xterm-256color",
        cols: process.stdout.columns || 100,
        rows: process.stdout.rows || 30,
        cwd: process.cwd(),
        env: process.env as { [key: string]: string },
      })
    } else {
      const userShell = process.env.SHELL || "/bin/zsh"
      const shellCmd = [bin, ...(args ?? [])].map(quoteArg).join(" ")
      term = pty.spawn(userShell, ["-lc", shellCmd], {
        name: "xterm-256color",
        cols: process.stdout.columns || 100,
        rows: process.stdout.rows || 30,
        cwd: process.cwd(),
        env: process.env as { [key: string]: string },
      })
    }
  } catch (e) {
    const msg = (e as Error).message
    log.error(`No se pudo lanzar "${bin}".`)
    log.dim(`Detalle: ${msg}`)
    log.dim("Si el binario no esta en tu PATH, instala el Gemini CLI:")
    log.dim("  npm install -g @google/gemini-cli")
    return 1
  }

  let pending: PendingTurn | null = null
  let currentPrompt = ""
  let flushTimer: NodeJS.Timeout | null = null

  const aiKey = openaiKey || process.env.OPENAI_API_KEY || ""

  const flushTurn = async (turn: PendingTurn) => {
    const raw = stripAnsi(turn.buf).replace(/\r/g, "").trim()
    if (!raw) return

    // Refrescar token si lleva mucho rato (sesiones largas)
    const nowSec = Math.floor(Date.now() / 1000)
    if (cfg.session && cfg.session.expires_at && cfg.session.expires_at - nowSec < 120) {
      try {
        const { createClient: cc } = await import("@supabase/supabase-js")
        const tmp = cc(
          (await import("../config.js")).SUPABASE_URL,
          (await import("../config.js")).SUPABASE_ANON_KEY,
          { auth: { persistSession: false, autoRefreshToken: false } },
        )
        const { data: r } = await tmp.auth.refreshSession({ refresh_token: cfg.session.refresh_token })
        if (r.session) {
          cfg.session.access_token = r.session.access_token
          cfg.session.refresh_token = r.session.refresh_token
          cfg.session.expires_at = r.session.expires_at ?? 0
          supabase.realtime.setAuth(r.session.access_token)
          await (await import("../config.js")).saveConfig(cfg)
          log.dim("Token refrescado durante la sesion.")
        }
      } catch { /* non-fatal */ }
    }

    const result = cleanOutput(raw)
    let response = result.cleaned.slice(0, 8_000)

    // Resumir con OpenAI si el texto limpio es largo
    if (response.length > 2000 && aiKey) {
      try {
        const summary = await summarizeWithAI(response, aiKey)
        if (summary) response = summary
      } catch { /* fallback a cleaned */ }
    }

    const projectId = cfg.project_id === "pending" ? null : cfg.project_id

    try {
      const { error: insertErr } = await supabase.from("agent_interactions_log").insert({
        user_id: cfg.user_id,
        user_name: cfg.user_name,
        project_id: projectId,
        session_id: sessionId,
        prompt_text: turn.prompt,
        gemini_response: response,
        model: bin,
        tokens_used: 0,
        files_read: result.files_read,
        files_written: result.files_written,
        tool_calls: result.tool_calls,
      })
      if (insertErr) {
        log.dim(`Turn no persistido: ${insertErr.message}`)
      } else {
        log.dim(`Turn capturado (${turn.prompt.slice(0, 40)}...)`)
      }
    } catch (e) {
      log.dim(`Turn no persistido: ${(e as Error).message}`)
    }

    // Actualizar team_sessions para heatmap realtime
    const { error: upsertErr } = await supabase.from("team_sessions").upsert({
      user_name: cfg.user_name,
      active_file: result.active_file,
      active_intent: turn.prompt.slice(0, 200),
      module_area: cfg.role,
      is_active: true,
      last_updated: new Date().toISOString(),
      model: bin,
    }, { onConflict: "user_name" })
    if (upsertErr) log.dim(`Heatmap no actualizado: ${upsertErr.message}`)

    // Actualizar estado local para deteccion de conflictos en Realtime
    const allFiles = [...result.files_read, ...result.files_written]
    if (result.active_file) allFiles.push(result.active_file)
    onFilesChanged?.(allFiles, turn.prompt.slice(0, 200))

    // Inyectar eventos URGENTES entre turnos (conflictos, PM, bloqueos).
    // Esperamos 800ms para que Gemini muestre su prompt de input.
    if (getUrgentUpdates) {
      setTimeout(() => {
        const urgent = getUrgentUpdates!()
        if (urgent.length > 0) {
          const block =
            "\n[HIVEMIND — ALERTA URGENTE DEL ENJAMBRE]\n" +
            urgent.map((e) => `⚠ ${e}`).join("\n") +
            "\n[FIN ALERTA — PARA lo que estes haciendo si te afecta y coordina via hivemind_add_trello_comment]\n\n"
          try {
            term.write(block + "\r")
          } catch {
            /* child closed */
          }
          process.stderr.write(
            `\n${brand.warn("🚨")} ${brand.warn(`ALERTA inyectada a Gemini (${urgent.length} conflicto(s))`)}\n`,
          )
        }
      }, 800)
    }
  }

  const scheduleFlush = () => {
    if (flushTimer) clearTimeout(flushTimer)
    flushTimer = setTimeout(() => {
      if (pending) {
        const t = pending
        pending = null
        void flushTurn(t)
      }
    }, 2500)
  }

  // ----- pty -> stdout -----
  term.onData((data) => {
    process.stdout.write(data)
    if (pending) {
      pending.buf += data
      scheduleFlush()
    }
  })

  // ----- stdin -> pty -----
  if (process.stdin.isTTY) {
    try {
      process.stdin.setRawMode(true)
    } catch {
      /* ignore */
    }
  }
  process.stdin.resume()
  process.stdin.setEncoding("utf8")

  /**
   * Formatea los eventos del buffer como un bloque de contexto que se
   * inyecta en el PTY justo antes del Enter del usuario. Gemini lo ve
   * como parte del mismo prompt.
   */
  const formatContextBlock = (events: string[]): string => {
    const lines = events.map((e) => `- ${e}`).join("\n")
    return (
      "\n\n[HIVEMIND — ACTUALIZACION DEL ENJAMBRE, lee antes de responder]\n" +
      lines +
      "\n[FIN ACTUALIZACION]\n\n"
    )
  }

  const onStdin = (data: string | Buffer) => {
    const text = typeof data === "string" ? data : data.toString("utf8")

    // Reenviar el chunk COMPLETO al PTY inmediatamente para no romper
    // el readline/ink de Gemini CLI. Solo trackeamos el prompt por separado.
    try {
      // Si hay Enter y hay prompt acumulado, inyectar contexto ANTES
      if ((text.includes("\r") || text.includes("\n")) && currentPrompt.trim() && getContextUpdates) {
        const events = getContextUpdates()
        if (events.length > 0) {
          const block = formatContextBlock(events)
          term.write(block)
          process.stderr.write(
            `\n${brand.accent("🐝")} ${brand.dim(`Contexto del enjambre inyectado (${events.length} evento(s))`)}\n`,
          )
        }
      }
      term.write(text)
    } catch {
      /* child closed */
    }

    // Trackear el prompt para captura de turns (sin interferir con el PTY)
    for (const ch of text) {
      if (ch === "\r" || ch === "\n") {
        // Limpiar escape codes y control chars del prompt capturado
        const trimmed = stripAnsi(currentPrompt).replace(/[\x00-\x1F\x7F]/g, "").trim()
        if (trimmed) {
          if (pending) {
            const t = pending
            pending = null
            void flushTurn(t)
          }
          pending = { prompt: trimmed, startedAt: Date.now(), buf: "" }
        }
        currentPrompt = ""
      } else if (ch === "\u007f" || ch === "\b") {
        currentPrompt = currentPrompt.slice(0, -1)
      } else if (ch >= " ") {
        currentPrompt += ch
      }
    }
  }
  process.stdin.on("data", onStdin)

  // ----- Resize -----
  const onResize = () => {
    try {
      term.resize(process.stdout.columns || 100, process.stdout.rows || 30)
    } catch {
      /* ignore */
    }
  }
  process.stdout.on("resize", onResize)

  return await new Promise<number>((resolve) => {
    term.onExit(({ exitCode }) => {
      if (pending) {
        const t = pending
        pending = null
        void flushTurn(t)
      }

      // Marcar al usuario como offline en el heatmap
      supabase.from("team_sessions").upsert({
        user_name: cfg.user_name,
        is_active: false,
        active_intent: null,
        last_updated: new Date().toISOString(),
        model: bin,
      }, { onConflict: "user_name" }).then(({ error }) => {
        if (error) log.debug(`No se pudo marcar offline: ${error.message}`)
      })

      process.stdin.off("data", onStdin)
      process.stdout.off("resize", onResize)
      if (process.stdin.isTTY) {
        try {
          process.stdin.setRawMode(false)
        } catch {
          /* ignore */
        }
      }
      process.stdin.pause()
      console.log()
      log.info(
        `Sesion finalizada. ${brand.dim(
          "Los turns capturados estan en agent_interactions_log."
        )}`
      )
      resolve(exitCode ?? 0)
    })
  })
}
