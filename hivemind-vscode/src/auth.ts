import * as vscode from 'vscode'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

/**
 * Cliente minimal contra Supabase GoTrue. No trae el SDK entero para
 * mantener el bundle por debajo de 100kb. Usa fetch nativo (Node 18+).
 *
 * Los tokens se guardan en SecretStorage (cifrado por VS Code).
 * Tras login exitoso, carga automaticamente el perfil del usuario y la
 * config del proyecto (Trello, Slack, OpenAI) desde Supabase.
 */

export interface HiveSession {
  accessToken: string
  refreshToken: string
  userId: string
  email: string
  expiresAt: number
  /** Nombre del usuario desde la tabla users */
  userName?: string
  /** project_id asignado al usuario */
  projectId?: string
}

const KEY = 'hivemind.session'

export class Auth {
  constructor(private readonly ctx: vscode.ExtensionContext) {}

  async signInWithPassword(email: string, password: string): Promise<HiveSession> {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({ email: email.trim(), password }),
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      throw new Error(this.extractError(body) ?? `HTTP ${res.status}`)
    }
    const json = (await res.json()) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
      user?: { id?: string; email?: string }
    }
    if (!json.access_token || !json.refresh_token) {
      throw new Error('Respuesta invalida de Supabase')
    }
    const session: HiveSession = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      userId: json.user?.id ?? '',
      email: json.user?.email ?? email,
      expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
    }

    // Cargar perfil + proyecto desde Supabase
    await this.loadUserProfile(session)

    await this.ctx.secrets.store(KEY, JSON.stringify(session))
    return session
  }

  /**
   * Tras login, carga nombre del usuario y config del proyecto.
   * Guarda projectId en la sesion para uso en toda la extension.
   */
  private async loadUserProfile(session: HiveSession): Promise<void> {
    try {
      const h = {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${session.accessToken}`,
        Accept: 'application/json',
      }

      // 1. Perfil del usuario
      const userRes = await fetch(
        `${SUPABASE_URL}/rest/v1/users?id=eq.${session.userId}&select=name,role`,
        { headers: h },
      )
      if (userRes.ok) {
        const users = (await userRes.json()) as { name?: string; role?: string }[]
        if (users[0]?.name) session.userName = users[0].name
      }

      // 2. Proyecto asignado
      const upRes = await fetch(
        `${SUPABASE_URL}/rest/v1/user_projects?user_id=eq.${session.userId}&select=project_id`,
        { headers: h },
      )
      if (upRes.ok) {
        const ups = (await upRes.json()) as { project_id?: string }[]
        if (ups[0]?.project_id) session.projectId = ups[0].project_id
      }
    } catch (e) {
      console.warn('[hivemind] loadUserProfile failed:', e)
    }
  }

  async getSession(): Promise<HiveSession | null> {
    const raw = await this.ctx.secrets.get(KEY)
    if (!raw) return null
    try {
      const s = JSON.parse(raw) as HiveSession
      if (s.expiresAt <= Date.now() + 60_000) {
        return await this.refresh(s.refreshToken)
      }
      return s
    } catch {
      return null
    }
  }

  async refresh(refreshToken: string): Promise<HiveSession | null> {
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      })
      if (!res.ok) return null
      const json = (await res.json()) as {
        access_token: string
        refresh_token: string
        expires_in: number
        user?: { id?: string; email?: string }
      }
      const session: HiveSession = {
        accessToken: json.access_token,
        refreshToken: json.refresh_token,
        userId: json.user?.id ?? '',
        email: json.user?.email ?? '',
        expiresAt: Date.now() + (json.expires_in ?? 3600) * 1000,
      }
      await this.ctx.secrets.store(KEY, JSON.stringify(session))
      return session
    } catch {
      return null
    }
  }

  async signOut() {
    await this.ctx.secrets.delete(KEY)
  }

  private extractError(body: string): string | null {
    try {
      const j = JSON.parse(body) as Record<string, string>
      return j.error_description || j.msg || j.message || j.error || null
    } catch {
      return body.slice(0, 200)
    }
  }
}
