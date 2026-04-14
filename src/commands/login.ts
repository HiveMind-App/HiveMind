import prompts from "prompts"
import { createClient } from "@supabase/supabase-js"
import { brand, banner } from "../brand.js"
import { log } from "../core/logger.js"
import { loadConfig, saveConfig, SUPABASE_URL, SUPABASE_ANON_KEY } from "../config.js"

/**
 * `hivemind login` — reautentica usando el config existente (email ya
 * conocido). Solo pide la password.
 *
 * Si no existe config previa, sugiere `hivemind init`.
 */
export async function runLogin(): Promise<void> {
  console.log(banner())
  console.log()

  const cfg = await loadConfig()
  if (!cfg) {
    log.warn("Aun no hay config. Ejecuta `hivemind init` la primera vez.")
    return
  }

  const { password } = await prompts({
    type: "password",
    name: "password",
    message: `Contraseña de ${cfg.email}`,
  })
  if (!password) {
    log.info("Cancelado.")
    return
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data: auth, error } = await client.auth.signInWithPassword({
    email: cfg.email,
    password,
  })

  if (error || !auth?.session) {
    log.error(`Login fallido: ${error?.message ?? "sin sesion"}.`)
    return
  }

  cfg.session = {
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
    expires_at: auth.session.expires_at ?? 0,
  }

  // Refrescar perfil y proyecto (puede haber cambiado desde el último init)
  try {
    const { data: profile } = await client
      .from("users")
      .select("id, email, name, role")
      .eq("id", auth.user!.id)
      .maybeSingle()
    if (profile) {
      cfg.user_id = profile.id
      cfg.user_name = profile.name
      cfg.email = profile.email
      cfg.role = profile.role as typeof cfg.role
    }
    const { data: joinRow } = await client
      .from("user_projects")
      .select("project_id, projects(id, name)")
      .eq("user_id", auth.user!.id)
      .limit(1)
      .maybeSingle()
    const project = (joinRow as any)?.projects ?? null
    if (project) {
      cfg.project_id = project.id
      cfg.project_name = project.name
    }
  } catch { /* non-fatal — usamos el perfil cacheado */ }

  await saveConfig(cfg)
  log.success(`Sesion renovada para ${brand.accent(cfg.user_name)} (${cfg.role}).`)
}
