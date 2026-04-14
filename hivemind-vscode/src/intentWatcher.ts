import * as vscode from 'vscode'
import type { Auth } from './auth'
import { upsertTeamSession } from './supabase'

/**
 * Escucha cambios en los editores y detecta intents del estilo
 *     // TODO: crear endpoint de login
 *     # TODO: refactorizar servicio
 *
 * Cada intent detectado se envía a team_sessions (upsert por user_id)
 * para que el Watchtower vea quién está trabajando en qué en tiempo real.
 * Debounce de 1.5s para no spammear Supabase en cada pulsación.
 */

const INTENT_REGEX = /(?:\/\/|#|--|\*)\s*TODO[:\-]?\s*(.+)/

export function registerIntentWatcher(ctx: vscode.ExtensionContext, auth: Auth) {
  let timer: NodeJS.Timeout | null = null

  const flush = async (doc: vscode.TextDocument, intent: string) => {
    const session = await auth.getSession()
    if (!session) return

    const file = vscode.workspace.asRelativePath(doc.uri)
    const userName = session.userName || session.email.split('@')[0] || 'dev'
    const moduleArea = guessModule(file)

    await upsertTeamSession(session, {
      user_id: session.userId,
      user_name: userName,
      active_file: file,
      active_intent: intent,
      module_area: moduleArea,
      is_active: true,
    })
  }

  const scheduleScan = (doc: vscode.TextDocument) => {
    if (timer) clearTimeout(timer)
    timer = setTimeout(async () => {
      const intent = findLatestIntent(doc)
      if (intent) {
        await flush(doc, intent)
      }
    }, 1500)
  }

  ctx.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument((e) => {
      if (e.document.uri.scheme !== 'file') return
      scheduleScan(e.document)
    }),
    vscode.window.onDidChangeActiveTextEditor(async (editor) => {
      if (!editor || editor.document.uri.scheme !== 'file') return
      const session = await auth.getSession()
      if (!session) return
      const file = vscode.workspace.asRelativePath(editor.document.uri)
      const userName = session.userName || session.email.split('@')[0] || 'dev'
      await upsertTeamSession(session, {
        user_id: session.userId,
        user_name: userName,
        active_file: file,
        active_intent: findLatestIntent(editor.document),
        module_area: guessModule(file),
        is_active: true,
      })
    }),
  )
}

function findLatestIntent(doc: vscode.TextDocument): string | null {
  const max = Math.min(doc.lineCount, 2000)
  let last: string | null = null
  for (let i = 0; i < max; i++) {
    const line = doc.lineAt(i).text
    const m = INTENT_REGEX.exec(line)
    if (m) last = m[1].trim()
  }
  return last
}

function guessModule(filePath: string): string | null {
  const segs = filePath.split('/')
  if (segs.length < 2) return null
  return segs.slice(0, 2).join('/')
}
