import * as vscode from 'vscode'
import { Auth } from './auth'
import { WatchtowerViewProvider } from './watchtowerView'
import { registerIntentWatcher } from './intentWatcher'
import { registerCollisionDecorations } from './collisionDecorations'
import { insertAgentInteraction } from './supabase'

/**
 * Entrypoint de la extension HiveMind para VS Code.
 *
 * Mantiene paridad funcional con el plugin de IntelliJ:
 *  - Login contra Supabase GoTrue
 *  - Webview con el Watchtower embebido (con token inyectado)
 *  - Intent watcher sobre TODOs en archivos abiertos
 *  - Decoraciones de colision equivalentes a ConflictInlayProvider
 *  - Comando "Ask HiveMind AI" sobre la seleccion activa
 */

export async function activate(ctx: vscode.ExtensionContext): Promise<void> {
  const auth = new Auth(ctx)
  const watchtowerProvider = new WatchtowerViewProvider(ctx, auth)

  ctx.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      WatchtowerViewProvider.viewType,
      watchtowerProvider,
    ),
  )

  // --- Commands ---
  ctx.subscriptions.push(
    vscode.commands.registerCommand('hivemind.login', async () => {
      const email = await vscode.window.showInputBox({
        prompt: 'Email de HiveMind',
        placeHolder: 'tu@email.com',
        ignoreFocusOut: true,
      })
      if (!email) return
      const password = await vscode.window.showInputBox({
        prompt: 'Contraseña',
        password: true,
        ignoreFocusOut: true,
      })
      if (!password) return
      try {
        const session = await auth.signInWithPassword(email, password)
        vscode.window.showInformationMessage(`HiveMind: sesión iniciada como ${session.email}`)
        await watchtowerProvider.refresh()
      } catch (e) {
        vscode.window.showErrorMessage(`HiveMind login: ${(e as Error).message}`)
      }
    }),

    vscode.commands.registerCommand('hivemind.logout', async () => {
      await auth.signOut()
      await watchtowerProvider.refresh()
      vscode.window.showInformationMessage('HiveMind: sesión cerrada.')
    }),

    vscode.commands.registerCommand('hivemind.openWatchtower', async () => {
      await vscode.commands.executeCommand('workbench.view.extension.hivemind')
      await watchtowerProvider.refresh()
    }),

    vscode.commands.registerCommand('hivemind.refreshTeam', async () => {
      await watchtowerProvider.refresh()
      vscode.window.setStatusBarMessage('$(sync) HiveMind: equipo refrescado', 2000)
    }),

    vscode.commands.registerCommand('hivemind.askAI', async () => {
      const session = await auth.getSession()
      if (!session) {
        vscode.window.showWarningMessage('HiveMind: primero haz login.')
        return
      }
      const editor = vscode.window.activeTextEditor
      if (!editor) return
      const selection = editor.selection
      const selectedText = editor.document.getText(selection).trim()
      const prompt = await vscode.window.showInputBox({
        prompt: 'Pregunta a la IA del enjambre',
        value: selectedText ? `Explica: ${selectedText.slice(0, 80)}` : '',
        ignoreFocusOut: true,
      })
      if (!prompt) return

      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'HiveMind · consultando IA...' },
        async () => {
          // Stub: por ahora solo persistimos la pregunta en agent_interactions_log.
          // El Watchtower mostrará el turn. La respuesta real sigue pasando por
          // el CLI hivemind-cli (Gemini CLI wrap) cuando el dev está en terminal.
          const projectId = session.projectId || null
          await insertAgentInteraction(session, {
            user_id: session.userId,
            project_id: projectId,
            prompt_text: prompt,
            gemini_response: '(pendiente — usa `hivemind run` para la respuesta completa)',
            model: 'vscode-stub',
          })
          vscode.window.showInformationMessage('HiveMind: intent enviado al enjambre.')
        },
      )
    }),
  )

  // --- Listeners ---
  registerIntentWatcher(ctx, auth)
  registerCollisionDecorations(ctx, auth)

  // Sesion inicial: si ya había token, avisamos
  const existing = await auth.getSession()
  if (existing) {
    vscode.window.setStatusBarMessage(
      `$(check) HiveMind · ${existing.email}`,
      4000,
    )
  }
}

export function deactivate(): void {
  /* nothing */
}
