import { brand, banner } from "../brand.js";
import { log } from "../core/logger.js";
import { loadConfig, SUPABASE_URL } from "../config.js";

/**
 * `hivemind status` — muestra el estado del CLI: config, conexion a Supabase,
 * presencia del binario `gemini`, etc. Implementacion completa en M1.6.
 */
export async function runStatus(): Promise<void> {
  console.log(banner());
  console.log();

  const cfg = await loadConfig();
  if (!cfg) {
    log.warn("HiveMind no esta inicializado. Ejecuta `hivemind init`.");
    return;
  }

  console.log(brand.accent("Usuario"));
  log.dim(`  user_name      ${cfg.user_name}`);
  log.dim(`  email          ${cfg.email}`);
  log.dim(`  role           ${cfg.role}`);
  log.dim(`  user_id        ${cfg.user_id}`);

  console.log();
  console.log(brand.accent("Proyecto"));
  log.dim(`  project_id     ${cfg.project_id}`);
  if (cfg.project_name) log.dim(`  project_name   ${cfg.project_name}`);

  console.log();
  console.log(brand.accent("Conexion"));
  log.dim(`  supabase_url   ${SUPABASE_URL}`);
  log.dim(
    `  session        ${
      cfg.session
        ? "OK (expira " +
          new Date(cfg.session.expires_at * 1000).toLocaleString("es-ES") +
          ")"
        : "(sin sesion — ejecuta `hivemind login`)"
    }`
  );

  console.log();
  log.dim(
    "Los checks activos (gemini CLI instalado, conectividad, Realtime) llegan con M1.6."
  );
}
