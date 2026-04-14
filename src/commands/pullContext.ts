import { createClient } from "@supabase/supabase-js"
import { brand, banner } from "../brand.js"
import { log } from "../core/logger.js"
import { requireConfig, SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js"
import { fetchIdentity } from "../core/identity.js"

/**
 * `hivemind pull-context` (M1.4) — descarga el system prompt personalizado
 * del Edge Function inject-identity y lo cachea en ~/.hivemind/identity.json.
 *
 * Tambien imprime un resumen en terminal: rol, proyecto, cards asignadas,
 * teammates activos y cualquier bloqueador.
 */
export async function runPullContext(): Promise<void> {
  console.log(banner())
  console.log()

  const cfg = await requireConfig()
  if (!cfg.session) {
    log.warn("No hay sesion. Ejecuta `hivemind login`.")
    return
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      headers: { Authorization: `Bearer ${cfg.session.access_token}` },
    },
  })
  supabase.realtime.setAuth(cfg.session.access_token)

  log.info(`Solicitando identidad para ${brand.accent(cfg.user_name)}…`)

  let identity
  try {
    identity = await fetchIdentity(cfg, supabase)
  } catch (e) {
    log.error((e as Error).message)
    return
  }

  log.success(
    `Identidad cacheada en ~/.hivemind/identity.json (proyecto ${
      identity.meta.project_name ?? identity.meta.project_id ?? "?"
    })`
  )
  console.log()

  console.log(brand.accent("Rol y permisos"))
  log.dim(`  rol            ${identity.meta.role}`)
  log.dim(
    `  allowed_paths  ${identity.allowed_paths.join(", ") || "(ninguno)"}`
  )
  console.log()

  if (identity.assigned_cards.length > 0) {
    console.log(brand.accent("Tarjetas Trello asignadas"))
    for (const c of identity.assigned_cards) {
      log.dim(`  · [${c.list_name ?? "?"}] ${c.name ?? "(sin nombre)"}`)
    }
    console.log()
  }

  if (identity.blockers.length > 0) {
    console.log(brand.warn("BLOQUEADORES"))
    for (const b of identity.blockers) {
      log.dim(`  ⚠ ${b.name ?? b.card_id} (en lista "${b.list ?? "?"}")`)
    }
    console.log()
  }

  if (identity.team_snapshot.length > 0) {
    console.log(brand.accent("Enjambre activo"))
    for (const m of identity.team_snapshot) {
      const files = m.active_files.length
        ? ` (${m.active_files.slice(0, 3).join(", ")})`
        : ""
      log.dim(`  · ${m.user_name}: ${m.current_task ?? "(sin tarea)"}${files}`)
    }
    console.log()
  }

  console.log(brand.accent("System prompt"))
  console.log()
  console.log(identity.system_prompt)
  console.log()
}
