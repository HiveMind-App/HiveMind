import { startMcpServer } from "../core/mcp-server.js"

/**
 * `hivemind mcp` — arranca el servidor MCP en stdio para que el Gemini
 * CLI lo registre y pueda llamar a las tools de HiveMind. No imprime
 * banner — el stdout esta reservado para el protocolo MCP.
 */
export async function runMcp(): Promise<void> {
  await startMcpServer()
}
