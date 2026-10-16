// Saves a player's fantasy team for the next round of the official season,
// after checking it the same way the game does: eleven players from the
// market in the formation's positions, a captain, within the budget, and
// before the market closes.
import { createClient } from 'npm:@supabase/supabase-js@2'
import type { PoolPlayer } from '../../../src/engine/fantasy/official.ts'
import { checkTeam, marketClosesAt, type FantasyTeam } from '../../../src/engine/fantasy/team.ts'
import { FORMATIONS } from '../../../src/engine/match/lineup.ts'
import type { Formation } from '../../../src/engine/model/types.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/** The team as sent, if it has the right shape; the rules are checked after. */
function readTeam(body: unknown): FantasyTeam | undefined {
  const { formation, playerIds, captainId } = (body ?? {}) as Record<string, unknown>
  if (typeof formation !== 'string' || !(formation in FORMATIONS)) return undefined
  if (!Array.isArray(playerIds) || !playerIds.every((id) => typeof id === 'string'))
    return undefined
  if (typeof captainId !== 'string') return undefined
  return { formation: formation as Formation, playerIds, captainId }
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: auth } = await asUser.auth.getUser()
  if (!auth.user) return json({ error: 'Entre na sua conta para escalar o time.' }, 401)

  const team = readTeam(await req.json().catch(() => undefined))
  if (!team) return json({ error: 'Time inválido.' }, 400)

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  try {
    const { data: season, error } = await db
      .from('fantasy_seasons')
      .select('id, played, rounds, last_played_at')
      .eq('status', 'em_andamento')
      .maybeSingle()
    if (error) throw error
    if (!season || season.played >= season.rounds) {
      return json({ error: 'Não há rodada aberta agora.' }, 409)
    }
    if (Date.now() >= marketClosesAt(new Date(season.last_played_at)).getTime()) {
      return json({ error: 'O mercado já fechou para esta rodada.' }, 409)
    }

    // The market for the next round is the one published with the last round played.
    const { data: round, error: roundError } = await db
      .from('fantasy_rounds')
      .select('pool')
      .eq('season_id', season.id)
      .eq('round', season.played)
      .single()
    if (roundError) throw roundError
    const verdict = checkTeam(team, round.pool as Record<string, PoolPlayer>)
    if (!verdict.ok) return json({ error: verdict.reason }, 422)

    const { error: saveError } = await db.from('fantasy_lineups').upsert({
      user_id: auth.user.id,
      season_id: season.id,
      round: season.played + 1,
      formation: team.formation,
      player_ids: team.playerIds,
      captain_id: team.captainId,
      updated_at: new Date().toISOString(),
    })
    if (saveError) throw saveError
    return json({ ok: true, round: season.played + 1 })
  } catch (error) {
    console.error(error)
    return json({ error: 'Não deu para salvar o time agora. Tente de novo.' }, 500)
  }
})
