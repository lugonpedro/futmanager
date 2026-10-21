// Starts a room's league once its draft is over, or plays its next round:
// first the claims for free players, worst placed first, then the matches
// with the lineups people saved. Called by the database when everyone is
// ready, and by a person when the rules let them (see
// 20261029000000_rodadas.sql). The state is saved only if nobody saved it
// since it was read, and only for the round the call meant to play, so two
// calls at once never play a round twice, nor a trade and a round undo
// each other.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { packJson } from '../../../src/cloud/codec.ts'
import type { Lineup } from '../../../src/engine/model/types.ts'
import { roomPhase } from '../../../src/engine/room/draft.ts'
import { resolveClaims, type Claim } from '../../../src/engine/room/market.ts'
import {
  leagueFromDraft,
  playSavedRound,
  roomSummary,
  slimReplay,
} from '../../../src/engine/room/summary.ts'
import type { RoomState } from '../../../src/engine/room/types.ts'
import {
  ATTEMPTS,
  CORS,
  json,
  loadState,
  saveState,
  writeRosters,
  writeSheets,
} from '../_shared/roomState.ts'

/** New randomness for each round, so a published replay never tells what comes next. */
const freshSeed = () => crypto.getRandomValues(new Uint32Array(1))[0]

const PAGE = 1000

type ClaimRow = { slot: number; player_id: string; release_id: string | null }

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
  const fromDatabase = !!secret && req.headers.get('x-cron-secret') === secret
  if (fromDatabase) {
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
    const { data: found, error } = await db.from('rooms').select('status').eq('id', room).single()
    if (error) throw error
    if (found.status === 'draft') return json(await startLeague(db, room))
    // The round this call is for: a later attempt that finds it played stops.
    let meant: number | undefined = fromDatabase ? Number(body?.round) : undefined
    for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
      const { state, version } = await loadState(db, room)
      meant ??= state.round
      if (roomPhase(state) !== 'liga' || state.round !== meant)
        return json({ ok: true, round: meant, again: true })
      const done = await playRound(db, room, state, version)
      if (done) return json({ ok: true, round: meant })
    }
    throw new Error(`Room ${room}: the state kept changing`)
  } catch (error) {
    console.error(error)
    return json({ error: 'Não deu para jogar a rodada agora. Tente de novo.' }, 500)
  }
})

/** Turns the finished draft into the league, with round 0 for the page. */
async function startLeague(db: SupabaseClient, room: number) {
  const { state: drafted, version } = await loadState(db, room)
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
  const state = leagueFromDraft(
    drafted,
    picks.map((p) => ({ teamId: String(p.slot), playerId: p.player_id })),
  )
  const claimed = await db
    .from('room_rounds')
    .insert({ room_id: room, round: 0, summary: roomSummary(state) })
  // Someone else started it a moment ago.
  if (claimed.error?.code === '23505') return { ok: true, round: 0, again: true }
  if (claimed.error) throw claimed.error
  if (!(await saveState(db, room, state, version))) throw new Error(`Room ${room} changed`)
  await publish(db, room, state, 0)
  return { ok: true, round: 0 }
}

/** Settles the claims and plays the round; false when the state changed meanwhile. */
async function playRound(
  db: SupabaseClient,
  room: number,
  start: RoomState,
  version: number,
): Promise<boolean> {
  const readAt = new Date().toISOString()
  const [lineups, claims] = await Promise.all([
    db.from('room_lineups').select('slot, lineup').eq('room_id', room).eq('round', start.round),
    db
      .from('room_claims')
      .select('slot, player_id, release_id')
      .eq('room_id', room)
      .order('slot')
      .order('position'),
  ])
  if (lineups.error) throw lineups.error
  if (claims.error) throw claims.error

  const settled = resolveClaims(
    start,
    (claims.data as ClaimRow[]).map((c): Claim => ({
      teamId: String(c.slot),
      playerId: c.player_id,
      releaseId: c.release_id ?? undefined,
    })),
  )
  const saved = Object.fromEntries(
    (lineups.data as { slot: number; lineup: Lineup }[]).map((r) => [String(r.slot), r.lineup]),
  )
  const played = playSavedRound(settled.state, saved, freshSeed())
  const state = played.state
  if (!(await saveState(db, room, state, version))) return false

  const round = start.round
  const written = await db.from('room_rounds').insert({
    room_id: room,
    round,
    summary: roomSummary(state),
    replays: await packJson(played.replays.map(slimReplay)),
  })
  if (written.error) throw written.error
  // Every claim read was settled, granted or not; later ones wait for the next round.
  const cleared = await db
    .from('room_claims')
    .delete()
    .eq('room_id', room)
    .lte('created_at', readAt)
  if (cleared.error) throw cleared.error
  if (settled.granted.length > 0) {
    const feed = await db.from('room_feed').insert(
      settled.granted.map((c) => ({
        room_id: room,
        round,
        kind: 'livre',
        slot: Number(c.teamId),
        players_in: [c.playerId],
        players_out: c.releaseId ? [c.releaseId] : [],
      })),
    )
    if (feed.error) throw feed.error
  }
  await publish(db, room, state, round)
  return true
}

/** Squads, sheets and the next round, once the state is saved. */
async function publish(db: SupabaseClient, room: number, state: RoomState, played: number) {
  const over = roomPhase(state) === 'encerrada'
  // Sheets first: a page that sees the squad change finds the sheet ready.
  if (!over) await writeSheets(db, room, state)
  await writeRosters(db, room, state)
  const opened = await db.rpc('room_open_round', { room, played, over })
  if (opened.error) throw opened.error
}
