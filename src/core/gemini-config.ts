import { homedir } from "node:os"
import { join, dirname } from "node:path"
import { mkdir, readFile, writeFile, copyFile, access } from "node:fs/promises"
import { log } from "./logger.js"

/**
 * Inyecta el MCP server "hivemind" en ~/.gemini/settings.json. Si el
 * archivo no existe lo crea. Si ya tiene un mcpServers.hivemind, lo
 * reemplaza. Hace backup la primera vez.
 *
 * Se llama automaticamente al lanzar `hivemind run` para que el Gemini
 * CLI oficial vea las tools sin que el user tenga que tocar nada.
 */
export async function ensureMcpRegistered(hivemindBin = "hivemind"): Promise<void> {
  const settingsPath = join(homedir(), ".gemini", "settings.json")
  await mkdir(dirname(settingsPath), { recursive: true })

  let current: any = {}
  try {
    await access(settingsPath)
    const raw = await readFile(settingsPath, "utf8")
    current = raw.trim() ? JSON.parse(raw) : {}
    // Backup la primera vez
    const backupPath = settingsPath + ".hivemind.bak"
    try {
      await access(backupPath)
    } catch {
      await copyFile(settingsPath, backupPath)
      log.debug(`Backup de gemini settings en ${backupPath}`)
    }
  } catch {
    current = {}
  }

  current.mcpServers = current.mcpServers ?? {}
  current.mcpServers.hivemind = {
    command: hivemindBin,
    args: ["mcp"],
  }

  await writeFile(settingsPath, JSON.stringify(current, null, 2) + "\n", "utf8")
  log.debug(`MCP server "hivemind" registrado en ${settingsPath}`)
}

/**
 * Escribe el system prompt de HiveMind en el archivo que Gemini CLI lee
 * al arrancar. Esto inyecta toda la info del enjambre (tarjetas, equipo,
 * herramientas, protocolo) como system instruction.
 */
export async function writeSystemInstruction(systemPrompt: string): Promise<void> {
  const instructionPath = join(homedir(), ".gemini", "GEMINI_SYSTEM_INSTRUCTION.txt")
  await mkdir(dirname(instructionPath), { recursive: true })
  await writeFile(instructionPath, systemPrompt, "utf8")
  log.debug(`System instruction escrita en ${instructionPath}`)
}
