import { type SupabaseClient } from "@supabase/supabase-js"
import { brand } from "../brand.js"
import { log } from "./logger.js"
import { type HiveMindConfig } from "../config.js"

/**
 * Suscripciones Realtime para una sesion `hivemind run`. Imprime avisos
 * en stderr (para no contaminar el stdout que va al PTY del Gemini CLI)
 * y acumula los eventos en un buffer que el interceptor inyecta en el
 * siguiente prompt del usuario para que la IA los vea.
 *
 * Eventos cubiertos:
 *  - god_messages (M5.5): mensajes broadcast del PM.
 *  - trello_events (M4.1): cambios en el board del proyecto.
 *  - shared_context: cambios de lock o resumen del enjambre.
 *
 * onIdentityStale se llama cuando algo relevante (Trello move, lock
 * sobre un archivo del user, mensaje del PM) sucede; el caller puede
 * usar esto para invalidar la cache de identity.
 */
export interface RealtimeOpts {
  cfg: HiveMindConfig
  supabase: SupabaseClient
  onIdentityStale?: () => void
}

// ── Buffer de eventos para inyectar en el siguiente prompt ──
const _eventBuffer: string[] = []

// ── Buffer URGENTE: conflictos que deben inyectarse ENTRE turnos ──
const _urgentBuffer: string[] = []

/** Drena todos los eventos acumulados y limpia el buffer. */
export function drainEventBuffer(): string[] {
  return _eventBuffer.splice(0)
}

/** Drena los eventos urgentes (conflictos). */
export function drainUrgentBuffer(): string[] {
  return _urgentBuffer.splice(0)
}

/** Añade un evento al buffer normal (usado tambien por el poll periodico). */
export function pushEvent(message: string): void {
  _eventBuffer.push(message)
}

/** Añade un evento URGENTE que se inyecta entre turnos sin esperar al user. */
export function pushUrgent(message: string): void {
  _urgentBuffer.push(message)
}

/**
 * Estado del agente local: que archivos esta tocando y en que area.
 * Se actualiza desde el interceptor despues de cada flush.
 */
export const localAgentState = {
  activeFiles: [] as string[],
  lastIntent: "",
  moduleArea: "",
}

export function startRealtimeListener({ cfg, supabase, onIdentityStale }: RealtimeOpts): () => void {
  const projectId = cfg.project_id

  const print = (icon: string, text: string, highlight = false) => {
    const prefix = highlight ? brand.warn(icon) : brand.accent(icon)
    process.stderr.write(`\n${prefix} ${highlight ? brand.warn(text) : brand.white(text)}\n`)
  }

  /** Imprime en stderr (para el humano) Y acumula en el buffer (para la IA). */
  const emit = (icon: string, text: string, highlight = false, bufferMsg?: string) => {
    print(icon, text, highlight)
    _eventBuffer.push(bufferMsg ?? text)
  }

  const subStatus = (name: string) => (status: string, err?: Error) => {
    if (status === "SUBSCRIBED") {
      log.dim(`Realtime: canal ${name} conectado.`)
    } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
      log.warn(`Realtime: canal ${name} fallo (${status}): ${err?.message ?? "sin detalle"}`)
    }
  }

  const channels = [
    supabase
      .channel(`hivemind-cli-god-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "god_messages",
          filter: `project_id=eq.${projectId}`,
        },
        (p) => {
          const r = p.new as any
          const msg = r.message ?? ""
          // Los mensajes del PM son siempre urgentes
          const urgentMsg = `MENSAJE URGENTE DEL PM: ${msg}. Obedece esta instruccion antes de hacer cualquier otra cosa.`
          print("⚡", `God Mode: ${msg}`, true)
          _urgentBuffer.push(urgentMsg)
          onIdentityStale?.()
        },
      )
      .subscribe(subStatus("god_messages")),

    supabase
      .channel(`hivemind-cli-trello-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "trello_events",
          filter: `project_id=eq.${projectId}`,
        },
        (p) => {
          const r = p.new as any
          const card = r.payload?.card?.name ?? r.card_id ?? "(tarjeta)"
          switch (r.event_type) {
            case "card_moved": {
              const after = r.payload?.list_after ?? "?"
              if (after.toLowerCase().includes("bloque")) {
                const urgentMsg = `BLOQUEADA: tarjeta "${card}" movida a ${after}. PARA inmediatamente si estas trabajando en algo relacionado con esta tarjeta.`
                print("⚠", `Tarjeta "${card}" BLOQUEADA.`, true)
                _urgentBuffer.push(urgentMsg)
              } else {
                emit("▤", `Tarjeta "${card}" → ${after}`, false,
                  `Tarjeta "${card}" movida a "${after}".`)
              }
              onIdentityStale?.()
              break
            }
            case "card_created":
              emit("✦", `Nueva tarjeta en el board: "${card}"`, false,
                `Nueva tarjeta en el board: "${card}".`)
              onIdentityStale?.()
              break
            case "card_updated":
              emit("◈", `Tarjeta actualizada: "${card}"`, false,
                `Tarjeta "${card}" actualizada.`)
              break
            case "card_deleted":
              emit("✗", `Tarjeta eliminada: "${card}"`, false,
                `Tarjeta "${card}" eliminada del board.`)
              onIdentityStale?.()
              break
            default:
              emit("·", `Trello: ${r.event_type} en "${card}"`)
          }
        },
      )
      .subscribe(subStatus("trello_events")),

    supabase
      .channel(`hivemind-cli-context-${projectId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "shared_context",
          filter: `project_id=eq.${projectId}`,
        },
        (p) => {
          const r = (p.new ?? p.old) as any
          if (!r || r.user_id === cfg.user_id) return

          const otherFiles: string[] = r.active_files ?? []
          const otherTask: string = r.current_task ?? ""
          const otherLabel = r.user_name ?? r.user_id?.slice?.(0, 6) ?? "agente"

          // Detectar CONFLICTO: el otro agente toca archivos que nosotros
          // estamos usando, o trabaja en la misma area.
          const myFiles = localAgentState.activeFiles
          const overlapping = otherFiles.filter((f: string) =>
            myFiles.some((mf) => f === mf || f.startsWith(mf.split("/").slice(0, -1).join("/") + "/"))
          )

          if (overlapping.length > 0) {
            const msg = `CONFLICTO: otro agente (${otherLabel}) esta tocando ${overlapping.join(", ")} que TU estas usando. PARA y coordina via Trello antes de seguir escribiendo esos archivos.`
            print("🚨", msg, true)
            _urgentBuffer.push(msg)
            onIdentityStale?.()
          } else if (r.summary) {
            emit("◇", `${otherLabel}: ${r.summary}`, false,
              `Otro agente del enjambre: ${r.summary}`)
          } else if (otherFiles.length) {
            const files = otherFiles.slice(0, 2).join(", ")
            emit("◇", `Otro agente trabaja en ${files}`, false,
              `Otro agente esta trabajando en: ${files}. Evita esos archivos.`)
          }
        },
      )
      .subscribe(subStatus("shared_context")),
  ]

  return () => {
    for (const ch of channels) supabase.removeChannel(ch)
  }
}
