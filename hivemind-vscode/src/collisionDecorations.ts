import * as vscode from 'vscode'
import type { Auth } from './auth'
import { fetchTeamSessions } from './supabase'

/**
 * Decoraciones de colision (equivalente al ConflictInlayProvider del
 * plugin IntelliJ). Marcamos el gutter + el background de las lineas
 * que tienen TODOs cuando otro dev del equipo está trabajando en el
 * mismo archivo o módulo.
 *
 * Implementación minimal pero funcional: cada 10s pedimos team_sessions,
 * calculamos colisiones contra el archivo activo y pintamos decoraciones.
 */

const TODO_REGEX = /(?:\/\/|#|--|\*)\s*TODO[:\-]?\s*(.+)/

export function registerCollisionDecorations(ctx: vscode.ExtensionContext, auth: Auth) {
  const collisionType = vscode.window.createTextEditorDecorationType({
    backgroundColor: 'rgba(249, 201, 0, 0.18)',
    borderWidth: '0 0 0 3px',
    borderStyle: 'solid',
    borderColor: '#F9C900',
    overviewRulerColor: '#F9C900',
    overviewRulerLane: vscode.OverviewRulerLane.Right,
    after: {
      color: '#F9C900',
      margin: '0 0 0 2em',
      contentText: '⬢ HiveMind: posible colisión con otro dev',
    },
  })

  const refresh = async () => {
    const editor = vscode.window.activeTextEditor
    if (!editor) return
    const session = await auth.getSession()
    if (!session) return

    const team = await fetchTeamSessions(session)
    const myFile = vscode.workspace.asRelativePath(editor.document.uri)
    const myUser = session.userId

    const collisions = team.filter(
      (m) => m.user_id !== myUser && m.is_active && m.active_file === myFile,
    )
    if (collisions.length === 0) {
      editor.setDecorations(collisionType, [])
      return
    }

    const decorations: vscode.DecorationOptions[] = []
    const max = Math.min(editor.document.lineCount, 2000)
    for (let i = 0; i < max; i++) {
      const line = editor.document.lineAt(i)
      if (TODO_REGEX.test(line.text)) {
        const names = collisions.map((c) => c.user_name).join(', ')
        decorations.push({
          range: line.range,
          hoverMessage: new vscode.MarkdownString(
            `**HiveMind** · ${names} también está editando \`${myFile}\``,
          ),
        })
      }
    }
    editor.setDecorations(collisionType, decorations)

    if (decorations.length > 0) {
      const names = collisions.map((c) => c.user_name).join(', ')
      vscode.window.setStatusBarMessage(
        `$(warning) HiveMind: colisión con ${names} en ${myFile}`,
        5000,
      )
    }
  }

  const interval = setInterval(refresh, 10_000)
  ctx.subscriptions.push(
    { dispose: () => clearInterval(interval) },
    vscode.window.onDidChangeActiveTextEditor(refresh),
    { dispose: () => collisionType.dispose() },
  )

  // Primera pasada inmediata
  void refresh()
}
