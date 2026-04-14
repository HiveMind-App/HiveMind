import type { HiveSession } from './auth'
import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config'

/**
 * Helper para llamadas REST autenticadas contra Supabase.
 * Usamos fetch directamente (Node 18+) en vez del SDK para mantener
 * el bundle pequeño.
 */

function headers(session: HiveSession | null): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${session?.accessToken ?? SUPABASE_ANON_KEY}`,
    'Content-Type': 'application/json',
    Accept: 'application/json',
    Prefer: 'return=representation',
  }
}

export async function upsertTeamSession(
  session: HiveSession,
  row: {
    user_id: string
    user_name: string
    active_file: string
    active_intent: string | null
    module_area: string | null
    is_active: boolean
  },
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/team_sessions?on_conflict=user_id`
  try {
    await fetch(url, {
      method: 'POST',
      headers: { ...headers(session), Prefer: 'resolution=merge-duplicates' },
      body: JSON.stringify([row]),
    })
  } catch (e) {
    console.error('[hivemind] upsert team_sessions failed:', e)
  }
}

export async function insertAgentInteraction(
  session: HiveSession,
  row: {
    user_id: string
    project_id: string | null
    prompt_text: string
    gemini_response: string
    model: string
  },
): Promise<void> {
  const url = `${SUPABASE_URL}/rest/v1/agent_interactions_log`
  try {
    await fetch(url, {
      method: 'POST',
      headers: headers(session),
      body: JSON.stringify([row]),
    })
  } catch (e) {
    console.error('[hivemind] insert agent_interactions_log failed:', e)
  }
}

export interface TeamMember {
  user_id: string
  user_name: string
  active_file: string
  active_intent: string | null
  is_active: boolean
}

export async function fetchTeamSessions(session: HiveSession): Promise<TeamMember[]> {
  const url = `${SUPABASE_URL}/rest/v1/team_sessions?select=user_id,user_name,active_file,active_intent,is_active`
  try {
    const res = await fetch(url, { headers: headers(session) })
    if (!res.ok) return []
    return (await res.json()) as TeamMember[]
  } catch {
    return []
  }
}
