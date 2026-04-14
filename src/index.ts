#!/usr/bin/env node
import "dotenv/config";
import { Command } from "commander";
import { runInit } from "./commands/init.js";
import { runLogin } from "./commands/login.js";
import { runLogout } from "./commands/logout.js";
import { runStatus } from "./commands/status.js";
import { runRun } from "./commands/run.js";
import { runPullContext } from "./commands/pullContext.js";
import { runMcp } from "./commands/mcp.js";
import { brand, TAGLINE } from "./brand.js";
import { log } from "./core/logger.js";

const program = new Command();

program
  .name("hivemind")
  .description(`HiveMind CLI — ${TAGLINE}`)
  .version("0.1.0");

program
  .command("init")
  .description("Inicializa la config local y une al user a un proyecto")
  .action(async () => {
    try {
      await runInit();
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("login")
  .description("Renueva la sesion con la contraseña (reusa config existente)")
  .action(async () => {
    try {
      await runLogin();
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("logout")
  .description("Cierra sesion local. --full borra el config entero")
  .option("--full", "Borra config.json completamente")
  .action(async (opts) => {
    try {
      await runLogout({ full: !!opts.full });
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("status")
  .description("Muestra el estado de la config y la conexion")
  .action(async () => {
    try {
      await runStatus();
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("pull-context")
  .description("Descarga el system prompt del equipo desde Supabase")
  .action(async () => {
    try {
      await runPullContext();
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("mcp")
  .description("Arranca el servidor MCP HiveMind en stdio (lo lanza Gemini CLI)")
  .action(async () => {
    try {
      await runMcp();
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

program
  .command("run")
  .description("Lanza una sesion de Gemini CLI interceptada por HiveMind")
  .action(async () => {
    try {
      await runRun();
    } catch (err) {
      log.error((err as Error).message);
      process.exit(1);
    }
  });

program.on("--help", () => {
  console.log();
  console.log("  " + brand.dim(TAGLINE));
});

program.parseAsync(process.argv).catch((err) => {
  log.error((err as Error).message);
  process.exit(1);
});
