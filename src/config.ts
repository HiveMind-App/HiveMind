import { homedir } from "node:os";
import { join } from "node:path";
import { mkdir, readFile, writeFile, chmod, access } from "node:fs/promises";

/**
 * Endpoint del backend HiveMind.
 * Cargado desde HIVEMIND_SUPABASE_URL (dotenv / variable de entorno).
 * Copia .env.example → .env y rellena los valores de tu proyecto.
 */
export const SUPABASE_URL =
  process.env.HIVEMIND_SUPABASE_URL ?? "";

/**
 * Anon key pública de Supabase (role=anon).
 * La seguridad la aplican las RLS policies — esta clave es segura para
 * distribuir en cliente, pero la cargamos desde entorno para que cualquiera
 * pueda apuntar a su propio backend HiveMind.
 */
export const SUPABASE_ANON_KEY =
  process.env.HIVEMIND_SUPABASE_ANON_KEY ?? "";

/**
 * Config local del CLI. Vive en ~/.hivemind/config.json.
 * Se crea con `hivemind init`. El user hace login con email+password
 * contra Supabase Auth (sin self-signup; las cuentas las crea el PM).
 */
export interface HiveMindConfig {
  /** UUID de auth.users (y de public.users) del usuario. */
  user_id: string;
  /** Nombre visible del user. */
  user_name: string;
  /** Email — clave de login. */
  email: string;
  /** Rol en el proyecto. */
  role: "frontend" | "backend" | "devops" | "admin";
  /** UUID del proyecto al que este user esta unido. */
  project_id: string;
  /** Nombre del proyecto (cache para status/UI). */
  project_name?: string;
  /** Endpoint de Supabase. */
  supabase_url: string;
  /** Anon key de Supabase. */
  supabase_anon_key: string;
  /** Sesion persistida de Supabase Auth. */
  session?: {
    access_token: string;
    refresh_token: string;
    expires_at: number;
  };
  /** API key personal del user para su Gemini CLI (opcional). */
  gemini_api_key?: string;
  /** Fecha de creacion del config. */
  created_at: string;
}

export const CONFIG_DIR = join(homedir(), ".hivemind");
export const CONFIG_PATH = join(CONFIG_DIR, "config.json");
export const SESSION_DIR = join(CONFIG_DIR, "sessions");

/** Asegura que ~/.hivemind existe con permisos restrictivos (0700). */
export async function ensureConfigDir(): Promise<void> {
  await mkdir(CONFIG_DIR, { recursive: true, mode: 0o700 });
  await mkdir(SESSION_DIR, { recursive: true, mode: 0o700 });
}

/** Devuelve el config o null si aun no esta inicializado. */
export async function loadConfig(): Promise<HiveMindConfig | null> {
  try {
    await access(CONFIG_PATH);
  } catch {
    return null;
  }
  const raw = await readFile(CONFIG_PATH, "utf8");
  try {
    return JSON.parse(raw) as HiveMindConfig;
  } catch {
    return null;
  }
}

/** Persiste el config en ~/.hivemind/config.json con permisos 0600. */
export async function saveConfig(cfg: HiveMindConfig): Promise<void> {
  await ensureConfigDir();
  await writeFile(CONFIG_PATH, JSON.stringify(cfg, null, 2) + "\n", "utf8");
  await chmod(CONFIG_PATH, 0o600);
}

/** Lee el config o lanza un error explicativo si no existe (el CLI no puede operar sin el). */
export async function requireConfig(): Promise<HiveMindConfig> {
  const cfg = await loadConfig();
  if (!cfg) {
    throw new Error(
      "HiveMind no esta inicializado. Ejecuta `hivemind init` primero."
    );
  }
  return cfg;
}
