import prompts from "prompts"
import { createClient } from "@supabase/supabase-js"
import { brand, banner } from "../brand.js"
import { log } from "../core/logger.js"
import {
  loadConfig,
  saveConfig,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
  type HiveMindConfig,
} from "../config.js"

/**
 * `hivemind init` — login email+password contra Supabase Auth y
 * descarga del perfil del user desde public.users.
 *
 * Requisito: el PM ya tiene que haber creado la cuenta desde el
 * Dashboard (sin self-signup).
 */
export async function runInit(): Promise<void> {
  console.log(banner())
  console.log()

  const existing = await loadConfig()
  if (existing) {
    log.warn(
      `Ya hay un config en ~/.hivemind/config.json (user=${brand.accent(
        existing.user_name
      )}).`
    )
    const { overwrite } = await prompts({
      type: "confirm",
      name: "overwrite",
      message: "¿Sobrescribir y volver a iniciar sesion?",
      initial: false,
    })
    if (!overwrite) {
      log.info("Abortado.")
      return
    }
  }

  const answers = await prompts([
    {
      type: "text",
      name: "email",
      message: "Email",
      initial: existing?.email,
      validate: (v: string) =>
        /.+@.+\..+/.test(v) || "Formato de email invalido",
    },
    {
      type: "password",
      name: "password",
      message: "Contraseña (te la da tu PM)",
      validate: (v: string) => v.length >= 6 || "Minimo 6 caracteres",
    },
  ])

  if (!answers.email || !answers.password) {
    log.error("Init cancelado.")
    return
  }

  const client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  log.info("Autenticando contra Supabase…")
  const { data: auth, error: authError } = await client.auth.signInWithPassword(
    {
      email: answers.email,
      password: answers.password,
    }
  )

  if (authError || !auth?.session || !auth.user) {
    log.error(
      `Login fallido: ${authError?.message ?? "sin sesion devuelta"}. ¿La cuenta existe?`
    )
    return
  }

  // Descargar perfil desde public.users
  const { data: profile, error: profileError } = await client
    .from("users")
    .select("id, email, name, role")
    .eq("id", auth.user.id)
    .maybeSingle()

  if (profileError || !profile) {
    log.error(
      "Login OK pero tu perfil no esta en public.users todavia. Pide al PM que ejecute hivemind_add_profile() en el SQL Editor."
    )
    await client.auth.signOut()
    return
  }

  // Descargar proyecto principal del user
  const { data: joinRow } = await client
    .from("user_projects")
    .select("project_id, projects(id, name)")
    .eq("user_id", auth.user.id)
    .limit(1)
    .maybeSingle()

  const project = (joinRow as any)?.projects ?? null
  if (!project) {
    log.warn(
      "No estas asignado a ningun proyecto todavia. Pide al PM que te anada con hivemind_add_profile(..., p_project_code)."
    )
  }

  const cfg: HiveMindConfig = {
    user_id: profile.id,
    user_name: profile.name,
    email: profile.email,
    role: profile.role as HiveMindConfig["role"],
    project_id: project?.id ?? "pending",
    project_name: project?.name,
    supabase_url: SUPABASE_URL,
    supabase_anon_key: SUPABASE_ANON_KEY,
    session: {
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
      expires_at: auth.session.expires_at ?? 0,
    },
    created_at: new Date().toISOString(),
  }

  await saveConfig(cfg)
  log.success(
    `Sesion guardada en ~/.hivemind/config.json — hola ${brand.accent(
      cfg.user_name
    )} (${cfg.role})`
  )
  if (cfg.project_name) {
    log.info(`Proyecto activo: ${brand.accent(cfg.project_name)}`)
  }
  log.dim("Ejecuta `hivemind run` para lanzar tu sesion de Gemini sincronizada con el enjambre.")
}
