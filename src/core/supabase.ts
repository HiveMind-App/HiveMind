import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_ANON_KEY, type HiveMindConfig } from "../config.js";

/**
 * Factory del cliente Supabase. Usa las credenciales hardcodeadas
 * + user_id/project_id del config como identificador.
 */
export function createHiveMindClient(cfg: HiveMindConfig): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        "x-hivemind-user": cfg.user_id,
        "x-hivemind-project": cfg.project_id,
      },
    },
  });
}
