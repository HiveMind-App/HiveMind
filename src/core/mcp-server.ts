import { Server } from "@modelcontextprotocol/sdk/server/index.js"
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js"
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js"
import { readFile, writeFile, mkdir } from "node:fs/promises"
import { dirname, isAbsolute, resolve, relative } from "node:path"
import { spawn } from "node:child_process"
import { createClient, type SupabaseClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_ANON_KEY, saveConfig } from "../config.js"
import { loadConfig, type HiveMindConfig } from "../config.js"
import {
  loadCachedIdentity,
  fetchIdentity,
  type AgentIdentity,
} from "./identity.js"
import { invokeFunction } from "./api.js"

// =============================================================
// HiveMind MCP server
// Expone 8 tools al Gemini CLI via stdio:
//   - hivemind_read_local_file
//   - hivemind_write_local_file (pasa por validate-file-write)
//   - hivemind_run_local_tests
//   - hivemind_read_trello_card
//   - hivemind_add_trello_comment
//   - hivemind_move_trello_card  (+ Slack notify)
//   - hivemind_create_trello_card (+ Slack notify)
//   - hivemind_list_my_cards
// =============================================================

interface Ctx {
  cfg: HiveMindConfig
  supabase: SupabaseClient
  identity: AgentIdentity
  trello: { key: string; token: string; board_id: string } | null
  /** Raiz del repo desde donde se lanzo `hivemind run`. */
  cwd: string
}

async function loadTrelloCreds(
  supabase: SupabaseClient,
  project_id: string,
): Promise<Ctx["trello"]> {
  const { data } = await supabase
    .from("projects")
    .select("trello_key, trello_token, trello_board_id")
    .eq("id", project_id)
    .maybeSingle()
  if (!data || !data.trello_key || !data.trello_token || !data.trello_board_id) {
    return null
  }
  return {
    key: data.trello_key,
    token: data.trello_token,
    board_id: data.trello_board_id,
  }
}

function trelloUrl(ctx: Ctx, path: string): string {
  const sep = path.includes("?") ? "&" : "?"
  return `https://api.trello.com/1${path}${sep}key=${ctx.trello!.key}&token=${ctx.trello!.token}`
}

/** Comprueba que `target` esta dentro de algun allowed_path. */
function isPathAllowed(target: string, allowed: string[], cwd: string): boolean {
  if (allowed.includes("**")) return true
  const abs = isAbsolute(target) ? target : resolve(cwd, target)
  const rel = relative(cwd, abs)
  if (rel.startsWith("..")) return false
  for (const p of allowed) {
    const trimmed = p.replace(/^\//, "").replace(/\/$/, "")
    if (rel === trimmed || rel.startsWith(trimmed + "/")) return true
  }
  return false
}

// -------- TOOLS --------

const TOOLS = [
  {
    name: "hivemind_read_local_file",
    description:
      "Lee un archivo del repositorio del usuario. Solo permite paths dentro de allowed_paths definidos en el system prompt. Usa esta tool antes de hacer cualquier write para entender el codigo existente.",
    inputSchema: {
      type: "object",
      properties: { path: { type: "string", description: "Path relativo o absoluto." } },
      required: ["path"],
    },
  },
  {
    name: "hivemind_write_local_file",
    description:
      "Escribe contenido a un archivo. ANTES de escribir, llama internamente al semaforo HiveMind validate-file-write para asegurarse de que ningun otro agente del equipo esta tocando el mismo archivo o trabajando en algo semanticamente equivalente. Si el semaforo deniega, devuelve un error explicando con quien hay conflicto y NO escribe.",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string" },
        content: { type: "string" },
        intent: {
          type: "string",
          description: "Resumen en una frase de lo que estas intentando lograr con este write. Lo usa el semaforo para detectar colisiones semanticas.",
        },
      },
      required: ["path", "content", "intent"],
    },
  },
  {
    name: "hivemind_run_local_tests",
    description:
      "Ejecuta un comando shell (idealmente un test runner) en el cwd del proyecto y devuelve stdout/stderr/exitCode. Timeout 60s.",
    inputSchema: {
      type: "object",
      properties: { command: { type: "string" } },
      required: ["command"],
    },
  },
  {
    name: "hivemind_read_trello_card",
    description:
      "Lee una tarjeta de Trello (nombre, descripcion, lista actual, comentarios). Usala para consultar los criterios de aceptacion de tu tarea ANTES de empezar a codificar y para chequear si la tarjeta sigue siendo tuya.",
    inputSchema: {
      type: "object",
      properties: { card_id: { type: "string" } },
      required: ["card_id"],
    },
  },
  {
    name: "hivemind_add_trello_comment",
    description:
      "Anade un comentario a una tarjeta de Trello. Usalo para documentar las decisiones tecnicas que tomas mientras trabajas y para dejar pistas al resto del enjambre.",
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "string" },
        text: { type: "string" },
      },
      required: ["card_id", "text"],
    },
  },
  {
    name: "hivemind_move_trello_card",
    description:
      "Mueve una tarjeta de Trello a otra lista. Usalo para marcarla como 'En Progreso' al empezar y como 'En Revision' al terminar.",
    inputSchema: {
      type: "object",
      properties: {
        card_id: { type: "string" },
        list_id: { type: "string" },
      },
      required: ["card_id", "list_id"],
    },
  },
  {
    name: "hivemind_create_trello_card",
    description:
      "Crea una tarjeta nueva en el board de Trello. Usala para registrar nuevas tareas, bugs o subtareas que descubras durante tu trabajo. La tarjeta se crea en la lista especificada (usa los IDs del system prompt).",
    inputSchema: {
      type: "object",
      properties: {
        list_id: { type: "string", description: "ID de la lista donde crear la tarjeta (del system prompt)." },
        name: { type: "string", description: "Titulo de la tarjeta." },
        desc: { type: "string", description: "Descripcion detallada (opcional)." },
      },
      required: ["list_id", "name"],
    },
  },
  {
    name: "hivemind_list_my_cards",
    description:
      "Devuelve la lista actualizada de tarjetas Trello asignadas a este agente. Llamala periodicamente para detectar cambios (tarjetas nuevas, reasignadas o bloqueadas).",
    inputSchema: { type: "object", properties: {} },
  },
] as const

// -------- TOOL HANDLERS --------

async function handleRead(ctx: Ctx, args: { path: string }): Promise<string> {
  if (!isPathAllowed(args.path, ctx.identity.allowed_paths, ctx.cwd)) {
    return JSON.stringify({
      error: `Path "${args.path}" fuera de tus allowed_paths (${ctx.identity.allowed_paths.join(", ")}).`,
    })
  }
  try {
    const abs = isAbsolute(args.path) ? args.path : resolve(ctx.cwd, args.path)
    const content = await readFile(abs, "utf8")
    return JSON.stringify({ ok: true, path: args.path, content })
  } catch (e) {
    return JSON.stringify({ error: (e as Error).message })
  }
}

async function handleWrite(
  ctx: Ctx,
  args: { path: string; content: string; intent: string },
): Promise<string> {
  if (!isPathAllowed(args.path, ctx.identity.allowed_paths, ctx.cwd)) {
    return JSON.stringify({
      error: `Path "${args.path}" fuera de tus allowed_paths.`,
    })
  }

  // Llamar al semaforo
  let data: any
  try {
    data = await invokeFunction(ctx.cfg, "validate-file-write", {
      user_id: ctx.cfg.user_id,
      project_id: ctx.cfg.project_id,
      file_path: args.path,
      intent_summary: args.intent,
    })
  } catch (e) {
    return JSON.stringify({ error: `validate-file-write fallo: ${(e as Error).message}` })
  }
  if (!(data as any)?.allowed) {
    return JSON.stringify({
      blocked: true,
      reason: (data as any)?.reason ?? "El semaforo HiveMind ha denegado el write.",
      conflicting_user: (data as any)?.conflicting_user ?? null,
      similarity: (data as any)?.similarity ?? null,
    })
  }

  try {
    const abs = isAbsolute(args.path) ? args.path : resolve(ctx.cwd, args.path)
    await mkdir(dirname(abs), { recursive: true })
    await writeFile(abs, args.content, "utf8")
    return JSON.stringify({ ok: true, path: args.path, lock_ttl: (data as any).lock_ttl })
  } catch (e) {
    return JSON.stringify({ error: (e as Error).message })
  }
}

function handleRunTests(args: { command: string }): Promise<string> {
  return new Promise((resolveP) => {
    const child = spawn("bash", ["-lc", args.command], { cwd: process.cwd() })
    let stdout = ""
    let stderr = ""
    const t = setTimeout(() => {
      child.kill("SIGKILL")
    }, 60_000)
    child.stdout.on("data", (d) => (stdout += d.toString()))
    child.stderr.on("data", (d) => (stderr += d.toString()))
    child.on("close", (code) => {
      clearTimeout(t)
      resolveP(
        JSON.stringify({
          exit_code: code,
          stdout: stdout.slice(0, 16_000),
          stderr: stderr.slice(0, 16_000),
        }),
      )
    })
  })
}

async function handleReadCard(ctx: Ctx, args: { card_id: string }): Promise<string> {
  if (!ctx.trello) return JSON.stringify({ error: "Trello no esta configurado para este proyecto." })
  const r = await fetch(trelloUrl(ctx, `/cards/${args.card_id}?fields=name,desc,idList,idMembers,labels,url&actions=commentCard&actions_limit=10`))
  if (!r.ok) return JSON.stringify({ error: `Trello ${r.status}` })
  return JSON.stringify(await r.json())
}

async function handleComment(
  ctx: Ctx,
  args: { card_id: string; text: string },
): Promise<string> {
  if (!ctx.trello) return JSON.stringify({ error: "Trello no esta configurado." })
  const r = await fetch(trelloUrl(ctx, `/cards/${args.card_id}/actions/comments`), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ text: args.text }),
  })
  if (!r.ok) return JSON.stringify({ error: `Trello ${r.status}` })
  const j = (await r.json()) as any
  return JSON.stringify({ ok: true, comment_id: j.id })
}

async function handleMove(
  ctx: Ctx,
  args: { card_id: string; list_id: string },
): Promise<string> {
  if (!ctx.trello) return JSON.stringify({ error: "Trello no esta configurado." })
  const r = await fetch(trelloUrl(ctx, `/cards/${args.card_id}`), {
    method: "PUT",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ idList: args.list_id }),
  })
  if (!r.ok) return JSON.stringify({ error: `Trello ${r.status}` })
  // Notificar por Slack cuando se mueve una tarjeta
  await notifySlack(ctx, `*${ctx.cfg.user_name}* movió una tarjeta a otra lista.`, "▤ TARJETA MOVIDA")
  return JSON.stringify({ ok: true })
}

async function handleCreateCard(
  ctx: Ctx,
  args: { list_id: string; name: string; desc?: string },
): Promise<string> {
  if (!ctx.trello) return JSON.stringify({ error: "Trello no esta configurado." })
  const params = new URLSearchParams({
    idList: args.list_id,
    name: args.name,
  })
  if (args.desc) params.set("desc", args.desc)
  const r = await fetch(trelloUrl(ctx, "/cards"), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  })
  if (!r.ok) return JSON.stringify({ error: `Trello ${r.status}` })
  const j = (await r.json()) as any
  // Notificar por Slack
  await notifySlack(ctx, `*${ctx.cfg.user_name}* creó una nueva tarjeta:\n>_"${args.name}"_`, "✦ NUEVA TARJETA")
  return JSON.stringify({ ok: true, card_id: j.id, url: j.url })
}

/** Envia una notificacion Block Kit a Slack via webhook del proyecto. Fire-and-forget. */
async function notifySlack(ctx: Ctx, text: string, header?: string): Promise<void> {
  try {
    const { data: proj } = await ctx.supabase
      .from("projects")
      .select("slack_webhook_url")
      .eq("id", ctx.cfg.project_id)
      .maybeSingle()
    if (!proj?.slack_webhook_url) return
    await fetch(proj.slack_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `🐝 HiveMind: ${text}`,
        username: "HiveMind Bot",
        icon_emoji: ":bee:",
        blocks: [
          {
            type: "header",
            text: { type: "plain_text", text: header ?? "🐝 HIVEMIND CLI" },
          },
          {
            type: "section",
            text: { type: "mrkdwn", text },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `📍 Agente: *${ctx.cfg.user_name}*  |  🧠 _Sincronizado vía HiveMind CLI_`,
              },
            ],
          },
        ],
      }),
    })
  } catch {
    // Slack es best-effort, no bloqueamos
  }
}

async function handleListMyCards(ctx: Ctx): Promise<string> {
  // Re-fetch identity para tener cards frescas
  try {
    const fresh = await fetchIdentity(ctx.cfg, ctx.supabase)
    ctx.identity = fresh
    return JSON.stringify({ assigned_cards: fresh.assigned_cards, blockers: fresh.blockers })
  } catch (e) {
    return JSON.stringify({ error: (e as Error).message })
  }
}

// -------- MAIN --------

export async function startMcpServer(): Promise<void> {
  const cfg = await loadConfig()
  if (!cfg || !cfg.session) {
    console.error(
      "HiveMind MCP server: no hay sesion. Ejecuta `hivemind login` primero.",
    )
    process.exit(1)
  }

  // SIEMPRE refrescar token al arrancar el MCP server — Gemini puede
  // lanzarlo minutos u horas después del `hivemind run`
  try {
    const tmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: r } = await tmp.auth.refreshSession({ refresh_token: cfg.session.refresh_token })
    if (r.session) {
      cfg.session.access_token = r.session.access_token
      cfg.session.refresh_token = r.session.refresh_token
      cfg.session.expires_at = r.session.expires_at ?? 0
      await saveConfig(cfg)
    }
  } catch {
    console.error("[hivemind-mcp] No se pudo refrescar el token. Las tools pueden fallar.")
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${cfg.session.access_token}` } },
  })

  let identity = await loadCachedIdentity()
  if (!identity) {
    identity = await fetchIdentity(cfg, supabase)
  }

  const trello = await loadTrelloCreds(supabase, cfg.project_id)
  if (!trello) {
    console.error("[hivemind-mcp] No se pudieron cargar credenciales de Trello del proyecto. Las tools de Trello no funcionarán.")
  }

  const ctx: Ctx = {
    cfg,
    supabase,
    identity,
    trello,
    cwd: process.cwd(),
  }

  const server = new Server(
    { name: "hivemind", version: "0.1.0" },
    { capabilities: { tools: {} } },
  )

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS as any,
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    // Refrescar token antes de cada tool call (el MCP server puede
    // llevar horas corriendo y el JWT expira cada ~1h)
    try {
      const freshCfg = await loadConfig()
      if (freshCfg?.session) {
        const tmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        const { data: r } = await tmp.auth.refreshSession({
          refresh_token: freshCfg.session.refresh_token,
        })
        if (r.session) {
          ctx.cfg.session = {
            access_token: r.session.access_token,
            refresh_token: r.session.refresh_token,
            expires_at: r.session.expires_at ?? 0,
          }
          await saveConfig(ctx.cfg)
          // Recrear supabase client con el nuevo token
          ctx.supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
            auth: { persistSession: false, autoRefreshToken: false },
            global: { headers: { Authorization: `Bearer ${r.session.access_token}` } },
          })
        }
      }
    } catch { /* non-fatal */ }

    const { name, arguments: args } = req.params
    let text: string
    switch (name) {
      case "hivemind_read_local_file":
        text = await handleRead(ctx, args as any)
        break
      case "hivemind_write_local_file":
        text = await handleWrite(ctx, args as any)
        break
      case "hivemind_run_local_tests":
        text = await handleRunTests(args as any)
        break
      case "hivemind_read_trello_card":
        text = await handleReadCard(ctx, args as any)
        break
      case "hivemind_add_trello_comment":
        text = await handleComment(ctx, args as any)
        break
      case "hivemind_move_trello_card":
        text = await handleMove(ctx, args as any)
        break
      case "hivemind_create_trello_card":
        text = await handleCreateCard(ctx, args as any)
        break
      case "hivemind_list_my_cards":
        text = await handleListMyCards(ctx)
        break
      default:
        text = JSON.stringify({ error: `tool desconocida: ${name}` })
    }
    return { content: [{ type: "text", text }] }
  })

  const transport = new StdioServerTransport()
  await server.connect(transport)
}
