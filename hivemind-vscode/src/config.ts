/**
 * Credenciales del backend HiveMind.
 *
 * Estas constantes se inyectan en tiempo de compilacion via esbuild --define.
 * El maintainer las establece como variables de entorno antes de hacer build:
 *
 *   HIVEMIND_SUPABASE_URL=https://... \
 *   HIVEMIND_SUPABASE_ANON_KEY=eyJ... \
 *   npm run build
 *
 * Si no se proveen, la extension usa cadena vacía como fallback hasta que
 * el usuario configure sus credenciales en los ajustes de VS Code.
 */
declare const __SUPABASE_URL__: string
declare const __SUPABASE_ANON_KEY__: string
declare const __WATCHTOWER_URL__: string

export const SUPABASE_URL: string =
  (typeof __SUPABASE_URL__ !== 'undefined' ? __SUPABASE_URL__ : '') ||
  (process.env.HIVEMIND_SUPABASE_URL ?? '')

export const SUPABASE_ANON_KEY: string =
  (typeof __SUPABASE_ANON_KEY__ !== 'undefined' ? __SUPABASE_ANON_KEY__ : '') ||
  (process.env.HIVEMIND_SUPABASE_ANON_KEY ?? '')

export const WATCHTOWER_URL: string =
  (typeof __WATCHTOWER_URL__ !== 'undefined' ? __WATCHTOWER_URL__ : '') ||
  (process.env.HIVEMIND_WATCHTOWER_URL ?? 'https://hivemind.aaangelmartin.com')
