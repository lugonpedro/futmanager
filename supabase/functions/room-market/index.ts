// The market moves that change a room's squads right away (see
// 20261030000000_mercado.sql): releasing a player, and accepting a trade
// someone offered. Both run the engine's rules on the room's state
// (src/engine/room/market.ts) and save it only if nobody saved it since it
// was read, so a round played at the same moment never undoes them.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { applyTrade, releasePlayer } from '../../../src/engine/room/market.ts'
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

type Trade = {
  id: number
  room_id: number
  from_slot: number
  to_slot: number
  give: string[]
  take: string[]
  status: string
}

/** A rule the player broke, to show them as it is. */
class Refused extends Error {}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = Deno.env.get('SUPABASE_URL')!
  const body = await req.json().catch(() => ({}))
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })

  try {
    if (body?.action === 'release') {
      const room = Number(body.room)
      const player = String(body.player ?? '')
      if (!Number.isInteger(room) || !player) return json({ error: 'Pedido inválido.' }, 400)
      const { data: slot } = await asUser.rpc('room_market_slot', { room })
      if (typeof slot !== 'number') return json({ error: 'O mercado não está aberto.' }, 403)
      await release(db, room, slot, player)
      return json({ ok: true })
    }
    if (body?.action === 'accept') {
      const id = Number(body.trade)
      if (!Number.isInteger(id)) return json({ error: 'Pedido inválido.' }, 400)
      const { data: trade, error } = await db
        .from('room_trades')
        .select('id, room_id, from_slot, to_slot, give, take, status')
        .eq('id', id)
        .maybeSingle()
      if (error) throw error
      const { data: slot } = trade
        ? await asUser.rpc('room_market_slot', { room: trade.room_id })
        : { data: null }
      if (!trade || slot !== trade.to_slot)
        return json({ error: 'Essa proposta não é para você.' }, 403)
      if (trade.status !== 'proposta')
        return json({ error: 'Essa proposta já foi respondida.' }, 409)
      await accept(db, trade as Trade)
      return json({ ok: true })
    }
    return json({ error: 'Pedido inválido.' }, 400)
  } catch (error) {
    if (error instanceof Refused) return json({ error: error.message }, 409)
    console.error(error)
    return json({ error: 'Não deu para falar com o servidor agora. Tente de novo.' }, 500)
  }
})

/** Runs a change on the state and saves it, starting over while other writes land first. */
async function change(
  db: SupabaseClient,
  room: number,
  apply: (state: RoomState) => RoomState,
): Promise<RoomState> {
  for (let attempt = 0; attempt < ATTEMPTS; attempt++) {
    const { state, version } = await loadState(db, room)
    let next: RoomState
    try {
      next = apply(state)
    } catch (error) {
      // The engine says why in the player's words.
      throw new Refused(error instanceof Error ? error.message : String(error))
    }
    if (await saveState(db, room, next, version)) return next
  }
  throw new Error(`Room ${room}: the state kept changing`)
}

async function release(db: SupabaseClient, room: number, slot: number, player: string) {
  const state = await change(db, room, (s) => releasePlayer(s, String(slot), player))
  // Sheets first: a page that sees the squad change finds the sheet ready.
  await writeSheets(db, room, state, [String(slot)])
  await writeRosters(db, room, state)
  const feed = await db.from('room_feed').insert({
    room_id: room,
    round: state.round,
    kind: 'dispensa',
    slot,
    players_out: [player],
  })
  if (feed.error) throw feed.error
}

async function accept(db: SupabaseClient, trade: Trade) {
  const room = trade.room_id
  const deal = {
    fromId: String(trade.from_slot),
    toId: String(trade.to_slot),
    give: trade.give,
    take: trade.take,
  }
  let state: RoomState
  try {
    state = await change(db, room, (s) => applyTrade(s, deal))
  } catch (error) {
    // A trade that no longer works can't be accepted later either.
    if (error instanceof Refused) {
      await db
        .from('room_trades')
        .update({ status: 'invalida', decided_at: new Date().toISOString() })
        .eq('id', trade.id)
        .eq('status', 'proposta')
    }
    throw error
  }
  const marked = await db
    .from('room_trades')
    .update({ status: 'aceita', decided_at: new Date().toISOString() })
    .eq('id', trade.id)
  if (marked.error) throw marked.error
  await writeSheets(db, room, state, [deal.fromId, deal.toId])
  await writeRosters(db, room, state)
  // Both squads changed, so both people look at their teams again.
  const unready = await db
    .from('room_teams')
    .update({ ready_round: null })
    .eq('room_id', room)
    .in('slot', [trade.from_slot, trade.to_slot])
  if (unready.error) throw unready.error
  const feed = await db.from('room_feed').insert({
    room_id: room,
    round: state.round,
    kind: 'troca',
    slot: trade.from_slot,
    other_slot: trade.to_slot,
    players_in: trade.take,
    players_out: trade.give,
  })
  if (feed.error) throw feed.error
}
