// Starts a room's league once its draft is over, or plays its next round with
// the lineups people saved. Called by the database when everyone is ready, and
// by a person when the rules let them (see 20261029000000_rodadas.sql). The
// round's row is written before the room's state, and its key is the room and
// the round, so two calls at once never play the same round twice.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { packJson, unpackJson } from '../../../src/cloud/codec.ts'
import { roomPhase } from '../../../src/engine/room/draft.ts'
import type { Lineup } from '../../../src/engine/model/types.ts'
import {
  leagueFromDraft,
  playSavedRound,
  roomSummary,
  slimReplay,
  teamSheet,
} from '../../../src/engine/room/summary.ts'
import type { RoomState } from '../../../src/engine/room/types.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/** New randomness for each round, so a published replay never tells what comes next. */
const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

const PAGE = 1000

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = Deno.env.get('SUPABASE_URL')!
  const body = await req.json().catch(() => ({}))
  const room = Number(body?.room)
  if (!Number.isInteger(room)) return json({ error: 'Sala inválida.' }, 400)

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  // The database carries the shared secret and the round everyone was ready
  // for; anyone else must be someone the room's rules let play it now.
  const secret = Deno.env.get('FANTASY_CRON_SECRET')
  if (secret && req.headers.get('x-cron-secret') === secret) {
    const { data: due } = await db.rpc('room_round_due', { room, round: Number(body?.round) })
    if (due !== true) return json({ ok: true, played: false })
  } else {
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    })
    const { data: allowed } = await asUser.rpc('can_play_round', { room })
    if (allowed !== true) return json({ error: 'Ainda não dá para jogar esta rodada.' }, 403)
  }

  try {
    const { data: found, error } = await db
      .from('rooms')
      .select('status, room_states(data)')
      .eq('id', room)
      .single()
    if (error) throw error
    const packed = (found.room_states as { data: string | null } | null)?.data
    if (!packed) throw new Error(`Room ${room} has no state`)
    let state = await unpackJson<RoomState>(packed)
    let round: number
    let replays: string | undefined

    if (found.status === 'draft') {
      const picks: { slot: number; player_id: string }[] = []
      for (let from = 0; ; from += PAGE) {
        const page = await db
          .from('room_picks')
          .select('slot, player_id')
          .eq('room_id', room)
          .order('pick')
          .range(from, from + PAGE - 1)
        if (page.error) throw page.error
        picks.push(...page.data)
        if (page.data.length < PAGE) break
      }
      state = leagueFromDraft(
        state,
        picks.map((p) => ({ teamId: String(p.slot), playerId: p.player_id })),
      )
      round = 0
    } else {
      if (roomPhase(state) !== 'liga') return json({ error: 'A liga já acabou.' }, 409)
      const { data: rows, error: lineupError } = await db
        .from('room_lineups')
        .select('slot, lineup')
        .eq('room_id', room)
        .eq('round', state.round)
      if (lineupError) throw lineupError
      const saved = Object.fromEntries(
        (rows as { slot: number; lineup: Lineup }[]).map((r) => [String(r.slot), r.lineup]),
      )
      const played = playSavedRound(state, saved, freshSeed())
      state = played.state
      round = state.round - 1
      replays = await packJson(played.replays.map(slimReplay))
    }

    const claimed = await db
      .from('room_rounds')
      .insert({ room_id: room, round, summary: roomSummary(state), replays })
    // Someone else played this round a moment ago.
    if (claimed.error?.code === '23505') return json({ ok: true, round, again: true })
    if (claimed.error) throw claimed.error

    const saved = await db
      .from('room_states')
      .update({ data: await packJson(state) })
      .eq('room_id', room)
    if (saved.error) throw saved.error
    const over = roomPhase(state) === 'encerrada'
    if (!over) {
      const sheets = await db.from('room_squads').upsert(
        state.teams.map((t) => ({
          room_id: room,
          slot: Number(t.id),
          data: teamSheet(state, t.id),
        })),
      )
      if (sheets.error) throw sheets.error
    }
    const opened = await db.rpc('room_open_round', { room, played: round, over })
    if (opened.error) throw opened.error
    return json({ ok: true, round })
  } catch (error) {
    console.error(error)
    return json({ error: 'Não deu para jogar a rodada agora. Tente de novo.' }, 500)
  }
})
