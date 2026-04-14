import { createClient } from "@supabase/supabase-js"
import { SUPABASE_URL, SUPABASE_ANON_KEY, saveConfig, type HiveMindConfig } from "../config.js"

/**
 * Refresca el JWT si esta expirado o a punto de expirar (<60s).
 * Modifica cfg.session in-place y persiste en disco.
 */
async function ensureFreshToken(cfg: HiveMindConfig): Promise<void> {
  if (!cfg.session?.refresh_token) return
  const now = Math.floor(Date.now() / 1000)
  if (cfg.session.expires_at && cfg.session.expires_at - now > 60) return
  try {
    const tmp = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    })
    const { data } = await tmp.auth.refreshSession({ refresh_token: cfg.session.refresh_token })
    if (data.session) {
      cfg.session.access_token = data.session.access_token
      cfg.session.refresh_token = data.session.refresh_token
      cfg.session.expires_at = data.session.expires_at ?? 0
      await saveConfig(cfg)
    }
  } catch { /* non-fatal — usamos el token viejo */ }
}

/**
 * Invoca una Edge Function de Supabase con `fetch` directo.
 * Refresca el JWT automaticamente si esta expirado.
 */
export async function invokeFunction<T = unknown>(
  cfg: HiveMindConfig,
  name: string,
  body: unknown,
): Promise<T> {
  await ensureFreshToken(cfg)
  const token = cfg.session?.access_token ?? SUPABASE_ANON_KEY
  const url = `${SUPABASE_URL}/functions/v1/${name}`
  const r = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "x-hivemind-user": cfg.user_id,
    },
    body: JSON.stringify(body ?? {}),
  })
  const text = await r.text()
  if (!r.ok) {
    throw new Error(
      `Edge Function ${name} respondio ${r.status}: ${text.slice(0, 300)}`,
    )
  }
  try {
    return JSON.parse(text) as T
  } catch {
    return text as unknown as T
  }
}
