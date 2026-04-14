import { type SupabaseClient } from "@supabase/supabase-js"
import { writeFile, readFile, mkdir } from "node:fs/promises"
import { join } from "node:path"
import { CONFIG_DIR, type HiveMindConfig } from "../config.js"
import { invokeFunction } from "./api.js"

/** Resultado canonico de inject-identity. */
export interface AgentIdentity {
  system_prompt: string
  assigned_cards: Array<{
    id: string
    name: string | null
    list_name: string | null
    url: string | null
  }>
  allowed_paths: string[]
  team_snapshot: Array<{
    user_name: string
    current_task: string | null
    active_files: string[]
    updated_at: string
  }>
  blockers: Array<{ card_id: string; name: string | null; list: string | null }>
  meta: {
    user_id: string
    user_name: string
    role: string
    project_id: string | null
    project_name: string | null
  }
}

const CACHE_PATH = join(CONFIG_DIR, "identity.json")

/**
 * Llama a la Edge Function inject-identity y devuelve el AgentIdentity
 * resultante. Tambien lo cachea en ~/.hivemind/identity.json para que el
 * interceptor lo lea sin volver a llamar.
 */
export async function fetchIdentity(
  cfg: HiveMindConfig,
  _supabase?: SupabaseClient,
): Promise<AgentIdentity> {
  const data = await invokeFunction<AgentIdentity & { error?: string }>(
    cfg,
    "inject-identity",
    {
      user_id: cfg.user_id,
      project_id: cfg.project_id === "pending" ? undefined : cfg.project_id,
    },
  )
  if ((data as any)?.error) {
    throw new Error(`inject-identity rechazo: ${(data as any).error}`)
  }
  await mkdir(CONFIG_DIR, { recursive: true })
  await writeFile(CACHE_PATH, JSON.stringify(data, null, 2), "utf8")
  return data as AgentIdentity
}

/** Devuelve el ultimo identity cacheado, o null si no hay. */
export async function loadCachedIdentity(): Promise<AgentIdentity | null> {
  try {
    const raw = await readFile(CACHE_PATH, "utf8")
    return JSON.parse(raw) as AgentIdentity
  } catch {
    return null
  }
}
