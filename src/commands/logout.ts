import { unlink } from "node:fs/promises"
import { createClient } from "@supabase/supabase-js"
import { brand, banner } from "../brand.js"
import { log } from "../core/logger.js"
import { CONFIG_PATH, SUPABASE_URL, SUPABASE_ANON_KEY, loadConfig, saveConfig } from "../config.js"

/**
 * `hivemind logout` — cierra la sesion en Supabase y borra el token local.
 * Preserva el resto del config (email, etc.) para que `hivemind login` sea rapido.
 *
 * Con --full tambien borra el config completo.
 */
export async function runLogout(opts: { full?: boolean } = {}): Promise<void> {
  console.log(banner())
  console.log()

  const cfg = await loadConfig()
  if (!cfg) {
    log.info("No hay sesion activa.")
    return
  }

  // Cerrar sesion en Supabase Auth (invalida el refresh_token)
  if (cfg.session) {
    try {
      const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false },
        global: {
          headers: { Authorization: `Bearer ${cfg.session.access_token}` },
        },
      })
      await client.auth.signOut()
    } catch { /* non-fatal — el token puede ya estar expirado */ }
  }

  if (opts.full) {
    try {
      await unlink(CONFIG_PATH)
      log.success("Config eliminado completamente.")
    } catch (e) {
      log.error(`No se pudo borrar ${CONFIG_PATH}: ${(e as Error).message}`)
    }
    return
  }

  delete cfg.session
  await saveConfig(cfg)
  log.success(`Sesion cerrada (${brand.accent(cfg.user_name)}).`)
}
