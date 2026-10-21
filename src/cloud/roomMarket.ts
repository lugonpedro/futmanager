import { supabase } from './client.ts'
import { invoke } from './draft.ts'
import { roomError } from './rooms.ts'

function client() {
  if (!supabase) throw new Error('O jogo online não está disponível nesta versão.')
  return supabase
}

/** Where a player is: a team's place, or released and claimable from a round. */
export type RosterEntry = { playerId: string; slot?: number; claimableFrom?: number }

/** A request for a free player, with who leaves in exchange. */
export type RoomClaim = { playerId: string; releaseId?: string }

export type TradeStatus = 'proposta' | 'aceita' | 'recusada' | 'cancelada' | 'vencida' | 'invalida'

export type RoomTrade = {
  id: number
  fromSlot: number
  toSlot: number
  /** What `fromSlot` gives, and what it takes from `toSlot`. */
  give: string[]
  take: string[]
  status: TradeStatus
  round: number
}

export type FeedEntry = {
  id: number
  round: number
  kind: 'troca' | 'livre' | 'dispensa'
  slot: number
  otherSlot?: number
  /** Who joined `slot`, and who left it. */
  playersIn: string[]
  playersOut: string[]
}

/** Rows per page; the server never sends more than a thousand at once. */
const PAGE = 1000

export async function loadRosters(room: number): Promise<RosterEntry[]> {
  const entries: RosterEntry[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client()
      .from('room_rosters')
      .select('player_id, slot, claimable_from')
      .eq('room_id', room)
      .order('player_id')
      .range(from, from + PAGE - 1)
    if (error) throw roomError(error)
    const rows = data as { player_id: string; slot: number | null; claimable_from: number | null }[]
    entries.push(
      ...rows.map((r) => ({
        playerId: r.player_id,
        slot: r.slot ?? undefined,
        claimableFrom: r.claimable_from ?? undefined,
      })),
    )
    if (rows.length < PAGE) return entries
  }
}

/** The player's claims, first tried first. */
export async function loadClaims(room: number): Promise<RoomClaim[]> {
  const { data, error } = await client()
    .from('room_claims')
    .select('player_id, release_id')
    .eq('room_id', room)
    .order('position')
  if (error) throw roomError(error)
  return (data as { player_id: string; release_id: string | null }[]).map((r) => ({
    playerId: r.player_id,
    releaseId: r.release_id ?? undefined,
  }))
}

export async function claimPlayer(room: number, claim: RoomClaim): Promise<void> {
  const { error } = await client().rpc('room_claim', {
    room,
    player: claim.playerId,
    release: claim.releaseId ?? null,
  })
  if (error) throw roomError(error)
}

export async function unclaimPlayer(room: number, playerId: string): Promise<void> {
  const { error } = await client().rpc('room_unclaim', { room, player: playerId })
  if (error) throw roomError(error)
}

export async function orderClaims(room: number, playerIds: readonly string[]): Promise<void> {
  const { error } = await client().rpc('room_order_claims', { room, players: playerIds })
  if (error) throw roomError(error)
}

/** The offers the player made or got that nobody answered yet. */
export async function loadOpenTrades(room: number): Promise<RoomTrade[]> {
  const { data, error } = await client()
    .from('room_trades')
    .select('id, from_slot, to_slot, give, take, status, round')
    .eq('room_id', room)
    .eq('status', 'proposta')
    .order('id')
  if (error) throw roomError(error)
  return (
    data as {
      id: number
      from_slot: number
      to_slot: number
      give: string[]
      take: string[]
      status: TradeStatus
      round: number
    }[]
  ).map((r) => ({
    id: r.id,
    fromSlot: r.from_slot,
    toSlot: r.to_slot,
    give: r.give,
    take: r.take,
    status: r.status,
    round: r.round,
  }))
}

export async function proposeTrade(
  room: number,
  toSlot: number,
  give: readonly string[],
  take: readonly string[],
): Promise<void> {
  const { error } = await client().rpc('room_propose_trade', {
    room,
    to_slot: toSlot,
    give,
    take,
  })
  if (error) throw roomError(error)
}

/** Withdraws the player's offer, or turns down one made to them. */
export async function dropTrade(trade: number): Promise<void> {
  const { error } = await client().rpc('room_drop_trade', { trade })
  if (error) throw roomError(error)
}

/** Accepts an offer: the players change teams right away. */
export const acceptTrade = (trade: number) =>
  invoke(
    'room-market',
    { action: 'accept', trade },
    'Não deu para aceitar a troca agora. Tente de novo.',
  )

/** Sends a player of the squad back to the free list, right away. */
export const releaseRoomPlayer = (room: number, playerId: string) =>
  invoke(
    'room-market',
    { action: 'release', room, player: playerId },
    'Não deu para dispensar agora. Tente de novo.',
  )

/** The latest market moves in the room, newest first. */
export async function loadFeed(room: number, limit = 30): Promise<FeedEntry[]> {
  const { data, error } = await client()
    .from('room_feed')
    .select('id, round, kind, slot, other_slot, players_in, players_out')
    .eq('room_id', room)
    .order('id', { ascending: false })
    .limit(limit)
  if (error) throw roomError(error)
  return (
    data as {
      id: number
      round: number
      kind: FeedEntry['kind']
      slot: number
      other_slot: number | null
      players_in: string[]
      players_out: string[]
    }[]
  ).map((r) => ({
    id: r.id,
    round: r.round,
    kind: r.kind,
    slot: r.slot,
    otherSlot: r.other_slot ?? undefined,
    playersIn: r.players_in,
    playersOut: r.players_out,
  }))
}
