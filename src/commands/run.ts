import { createClient } from "@supabase/supabase-js"
import { brand, banner } from "../brand.js"
import { log } from "../core/logger.js"
import { requireConfig, SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js"
import { runInterceptor } from "../core/interceptor.js"
import { fetchIdentity, type AgentIdentity } from "../core/identity.js"
import { invokeFunction } from "../core/api.js"
import { ensureMcpRegistered, writeSystemInstruction } from "../core/gemini-config.js"
import { startRealtimeListener, drainEventBuffer, drainUrgentBuffer, pushEvent, pushUrgent, localAgentState } from "../core/realtime.js"

/**
 * `hivemind run` — lanza el Gemini CLI oficial bajo un wrapper PTY que
 * captura cada turn y lo manda a Supabase. Implementa M1.2.
 */
export async function runRun(): Promise<void> {
  console.log(banner())
  console.log()

  const cfg = await requireConfig()
  if (!cfg.session) {
    log.warn(
      "No hay sesion activa. Ejecuta `hivemind login` para autenticar."
    )
    return
  }

  // Refrescar token si esta expirado o a punto de expirar (margen de 60s)
  const now = Math.floor(Date.now() / 1000)
  if (cfg.session.expires_at && cfg.session.expires_at - now < 60) {
    log.dim("Token expirado, refrescando...")
    const tmpClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data: refreshed, error: refreshErr } = await tmpClient.auth.refreshSession({
      refresh_token: cfg.session.refresh_token,
    })
    if (refreshErr || !refreshed.session) {
      log.error(`No se pudo refrescar la sesion: ${refreshErr?.message ?? "sin sesion"}. Ejecuta \`hivemind login\`.`)
      return
    }
    cfg.session = {
      access_token: refreshed.session.access_token,
      refresh_token: refreshed.session.refresh_token,
      expires_at: refreshed.session.expires_at ?? 0,
    }
    await (await import("../config.js")).saveConfig(cfg)
    log.dim("Token refrescado.")
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: {
        Authorization: `Bearer ${cfg.session.access_token}`,
      },
    },
  })

  // Autenticar el canal Realtime con el access_token del usuario.
  // Sin esto, el WebSocket se conecta como anon y las RLS policies
  // bloquean los postgres_changes.
  supabase.realtime.setAuth(cfg.session.access_token)

  // Cargar OpenAI key del proyecto para resumir output largo
  let projectOpenAiKey = process.env.OPENAI_API_KEY ?? ""
  if (!projectOpenAiKey && cfg.project_id && cfg.project_id !== "pending") {
    try {
      const { data } = await supabase
        .from("projects")
        .select("openai_api_key")
        .eq("id", cfg.project_id)
        .maybeSingle()
      if (data?.openai_api_key) projectOpenAiKey = data.openai_api_key
    } catch { /* non-fatal */ }
  }

  log.info(
    `Sesion para ${brand.accent(cfg.user_name)} (${cfg.role})${
      cfg.project_name ? " en " + brand.accent(cfg.project_name) : ""
    }`
  )

  // Refresca el identity (system prompt + tarjetas + bloqueadores) y lo
  // cachea en ~/.hivemind/identity.json para que el MCP server lo lea.
  try {
    const identity = await fetchIdentity(cfg, supabase)
    log.info(
      `Contexto actualizado: ${identity.assigned_cards.length} tarjeta(s) asignada(s), ${identity.team_snapshot.length} agente(s) activo(s) en el enjambre.`
    )
    if (identity.blockers.length > 0) {
      log.warn(
        `Tienes ${identity.blockers.length} bloqueador(es) — Gemini va a parar antes de tocar nada.`
      )
    }

    // Inyectar system prompt del enjambre para que Gemini lo lea al arrancar
    try {
      await writeSystemInstruction(identity.system_prompt)
      // Setear env var para que Gemini CLI lo use
      process.env.GEMINI_SYSTEM_INSTRUCTION = identity.system_prompt
      log.dim("System prompt del enjambre inyectado.")
    } catch { /* non-fatal */ }

    // Registrar intent inicial en team_sessions para que el heatmap lo vea
    try {
      const firstCard = identity.assigned_cards[0]
      await invokeFunction(cfg, "register-intent", {
        user_name: cfg.user_name,
        intent_text: firstCard
          ? `Trabajando en: ${firstCard.name ?? firstCard.id}`
          : "Iniciando sesion HiveMind",
        module_area: cfg.role,
        role: cfg.role,
      })
      log.dim("Intent registrado en HiveMind.")
    } catch {
      // Non-fatal
    }
  } catch (e) {
    log.warn(
      `No se pudo refrescar el contexto (${(e as Error).message}). Sigo con el cache si existe.`
    )
  }

  // Registra el MCP server "hivemind" en ~/.gemini/settings.json para
  // que el Gemini CLI oficial vea las 7 tools al arrancar.
  try {
    await ensureMcpRegistered()
    log.dim("MCP server hivemind registrado en ~/.gemini/settings.json.")
  } catch (e) {
    log.warn(
      `No se pudo registrar el MCP server: ${(e as Error).message}. Las tools no estaran disponibles.`
    )
  }

  // Realtime listener — escucha trello_events, god_messages y
  // shared_context del proyecto, imprime avisos en stderr y acumula
  // eventos en el buffer para inyectarlos en el siguiente prompt.
  const stopListener = startRealtimeListener({
    cfg,
    supabase,
    onIdentityStale: () => {
      // Background refresh — no bloquea la sesion
      fetchIdentity(cfg, supabase).catch(() => {})
    },
  })

  // Poll periodico (cada 3 min): refresca identity y detecta cambios
  // en el equipo que no llegaron por Realtime (ej: nuevos miembros,
  // tarjetas reasignadas, blockers nuevos). Los cambios se acumulan
  // en el buffer del Realtime para inyectarse en el siguiente prompt.
  let lastTeamNames: string[] = []
  try {
    const id = await fetchIdentity(cfg, supabase).catch(() => null)
    if (id) {
      lastTeamNames = id.team_snapshot.map((s) => s.user_name).sort()
    }
  } catch { /* ignore */ }

  const POLL_INTERVAL_MS = 3 * 60 * 1000 // 3 minutos
  const pollTimer = setInterval(async () => {
    try {
      const fresh = await fetchIdentity(cfg, supabase)
      const freshNames = fresh.team_snapshot.map((s) => s.user_name).sort()

      // Detectar agentes que entraron o salieron
      for (const name of freshNames) {
        if (!lastTeamNames.includes(name)) {
          const member = fresh.team_snapshot.find((s) => s.user_name === name)
          const task = member?.current_task ?? "sin tarea"
          pushEvent(`${name} se unio al enjambre (${task}).`)
        }
      }
      for (const name of lastTeamNames) {
        if (!freshNames.includes(name)) {
          pushEvent(`${name} ya no esta activo en el enjambre.`)
        }
      }

      // Detectar agentes que ahora trabajan en nuestros archivos
      const myFiles = localAgentState.activeFiles
      if (myFiles.length > 0) {
        for (const member of fresh.team_snapshot) {
          const theirFiles = member.active_files ?? []
          const overlap = theirFiles.filter((f: string) => myFiles.includes(f))
          if (overlap.length > 0) {
            pushUrgent(
              `CONFLICTO (poll): ${member.user_name} esta tocando ${overlap.join(", ")} que TU usas. PARA y coordina.`
            )
          }
        }
      }

      // Detectar nuevos blockers
      if (fresh.blockers.length > 0) {
        for (const b of fresh.blockers) {
          pushUrgent(`BLOQUEADOR: "${b.name ?? b.card_id}" esta en "${b.list ?? "?"}". PARA si trabajas en algo relacionado.`)
        }
      }

      // Detectar tarjetas asignadas que cambiaron de lista (Trello fetch)
      for (const card of fresh.assigned_cards) {
        const listName = (card.list_name ?? "").toLowerCase()
        if (listName.includes("bloque") || listName.includes("block")) {
          pushUrgent(`Tu tarjeta "${card.name}" esta BLOQUEADA en "${card.list_name}". No sigas trabajando en ella.`)
        }
      }

      lastTeamNames = freshNames
      log.dim(`Poll periodico: ${fresh.team_snapshot.length} agente(s), ${fresh.blockers.length} bloqueador(es).`)
    } catch {
      // Non-fatal: el poll falla silenciosamente
    }
  }, POLL_INTERVAL_MS)

  try {
    // Inicializar estado local con el role del config
    localAgentState.moduleArea = cfg.role

    const exitCode = await runInterceptor({
      cfg,
      supabase,
      openaiKey: projectOpenAiKey,
      getContextUpdates: drainEventBuffer,
      getUrgentUpdates: drainUrgentBuffer,
      onFilesChanged: (files, intent) => {
        localAgentState.activeFiles = files
        localAgentState.lastIntent = intent
      },
    })
    if (exitCode !== 0) {
      process.exit(exitCode)
    }
  } finally {
    clearInterval(pollTimer)
    stopListener()
  }
}
