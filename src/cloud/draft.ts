import type { RealtimeChannel } from '@supabase/supabase-js'
import type { Formation } from '../engine/model/types.ts'
import type { PoolPlayer } from '../engine/room/start.ts'
import type { RoomSummary } from '../engine/room/summary.ts'
import type { TeamIdentity } from '../engine/room/team.ts'
import { supabase } from './client.ts'
import { roomError, type RoomRow } from './rooms.ts'

/** The pick under way as a live update told it, ahead of the next full load of the room. */
export type LiveClock = { pickNo: number; deadline?: Date }

/** A team of a room once the draft started: a person's or a robot's, by its place. */
export type DraftTeam = TeamIdentity & {
  slot: number
  userId?: string
  robot: boolean
  /** Picking on its own: switched on, or after two missed picks in a row. */
  auto: boolean
  /** The round of the league its person marked "Pronto" for. */
  readyRound?: number
  /** The formation whose places it fills in the draft; none until chosen or first dealt. */
  formation?: Formation
}

export type DraftPick = {
  pick: number
  slot: number
  playerId: string
  auto: boolean
  /** The place of the team it filled, as teamSlots() lists them; none in drafts made before. */
  slotIndex?: number
  /** Overall added when the card taken was the deal's prime. */
  primeBoost?: number
}

/** The cards dealt for a pick: for one place of the team on the clock, which keeps one. */
export type DraftDeal = {
  pick: number
  slot: number
  slotIndex: number
  playerIds: string[]
  /** The card dealt as a prime, if any, and the overall it gains. */
  prime?: { playerId: string; boost: number }
}

function client() {
  if (!supabase) throw new Error('O jogo online não está disponível nesta versão.')
  return supabase
}

/** Rows per page; the server never sends more than a thousand at once. */
const PAGE = 1000

type TeamRow = {
  slot: number
  user_id: string | null
  team_name: string
  short_name: string
  color_primary: string
  color_secondary: string
  robot: boolean
  auto: boolean
  ready_round: number | null
  formation?: string | null
}

export const toDraftTeam = (row: TeamRow): DraftTeam => ({
  slot: row.slot,
  userId: row.user_id ?? undefined,
  name: row.team_name,
  shortName: row.short_name,
  colors: { primary: row.color_primary, secondary: row.color_secondary },
  robot: row.robot,
  auto: row.auto,
  readyRound: row.ready_round ?? undefined,
  formation: (row.formation ?? undefined) as Formation | undefined,
})

type PickRow = {
  pick: number
  slot: number
  player_id: string
  auto: boolean
  slot_index?: number | null
  prime_boost?: number | null
}

export const toDraftPick = (row: PickRow): DraftPick => ({
  pick: row.pick,
  slot: row.slot,
  playerId: row.player_id,
  auto: row.auto,
  slotIndex: row.slot_index ?? undefined,
  primeBoost: row.prime_boost ?? undefined,
})

type DealRow = {
  pick: number
  slot: number
  slot_index: number
  player_ids: string[]
  prime_id?: string | null
  prime_boost?: number | null
}

const toDraftDeal = (row: DealRow): DraftDeal => ({
  pick: row.pick,
  slot: row.slot,
  slotIndex: row.slot_index,
  playerIds: row.player_ids,
  prime:
    row.prime_id && row.prime_boost
      ? { playerId: row.prime_id, boost: row.prime_boost }
      : undefined,
})

export async function loadDraftTeams(room: number): Promise<DraftTeam[]> {
  const { data, error } = await client()
    .from('room_teams')
    .select(
      'slot, user_id, team_name, short_name, color_primary, color_secondary, robot, auto, ready_round, formation',
    )
    .eq('room_id', room)
    .order('slot')
  if (error) throw roomError(error)
  return (data as TeamRow[]).map(toDraftTeam)
}

export async function loadDraftPicks(room: number): Promise<DraftPick[]> {
  const picks: DraftPick[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client()
      .from('room_picks')
      .select('pick, slot, player_id, auto, slot_index, prime_boost')
      .eq('room_id', room)
      .order('pick')
      .range(from, from + PAGE - 1)
    if (error) throw roomError(error)
    picks.push(...(data as PickRow[]).map(toDraftPick))
    if (data.length < PAGE) return picks
  }
}

/** The cards dealt for a pick, if they were dealt. */
export async function loadDraftDeal(room: number, pick: number): Promise<DraftDeal | undefined> {
  const { data, error } = await client()
    .from('room_deals')
    .select('pick, slot, slot_index, player_ids, prime_id, prime_boost')
    .eq('room_id', room)
    .eq('pick', pick)
    .maybeSingle()
  if (error) throw roomError(error)
  return data ? toDraftDeal(data as DealRow) : undefined
}

/** On the player's turn, deals the cards for an empty place of their team. */
export async function openDraftSlot(room: number, place: number): Promise<void> {
  const { error } = await client().rpc('draft_open_slot', { room, place })
  if (error) throw roomError(error)
}

/** The player's formation, before their first card is dealt. */
export async function setDraftFormation(room: number, formation: Formation): Promise<void> {
  const { error } = await client().rpc('draft_set_formation', { room, chosen: formation })
  if (error) throw roomError(error)
}

/** The players the room drafts from, as the server listed them; strongest first. */
export async function loadDraftPool(room: number): Promise<PoolPlayer[]> {
  const pool: PoolPlayer[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await client()
      .from('room_pool')
      .select('player_id, name, position, overall, age, origin, rank')
      .eq('room_id', room)
      .order('rank')
      .range(from, from + PAGE - 1)
    if (error) throw roomError(error)
    pool.push(
      ...(
        data as {
          player_id: string
          name: string
          position: PoolPlayer['position']
          overall: number
          age: number
          origin: string
          rank: number
        }[]
      ).map((r) => ({
        id: r.player_id,
        name: r.name,
        position: r.position,
        overall: r.overall,
        age: r.age,
        origin: r.origin,
        rank: r.rank,
      })),
    )
    if (data.length < PAGE) return pool
  }
}

/** The player's pick; refused when it isn't their turn or the player can't be taken. */
export async function draftPick(room: number, playerId: string): Promise<void> {
  const { error } = await client().rpc('draft_pick', { room, player: playerId })
  if (error) throw roomError(error)
}

/** Asks the server to make the pick whose clock ran out; it does nothing before the deadline. */
export async function draftTick(room: number): Promise<boolean> {
  const { data, error } = await client().rpc('draft_tick', { room })
  if (error) throw roomError(error)
  return data === true
}

/** Calls one of the room's server functions, with the message it answers on failure. */
export async function invoke(
  name: string,
  body: Record<string, unknown>,
  fallback: string,
): Promise<void> {
  const { data, error } = await client().functions.invoke(name, { body })
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => undefined)
    throw new Error(body?.error ?? fallback)
  }
  if (data?.error) throw new Error(data.error)
}

/** Starts the draft of a waiting room now; only its owner can. */
export const startDraftNow = (room: number) =>
  invoke('room-draft', { room }, 'Não deu para começar o draft agora. Tente de novo.')

/**
 * Starts the league once the draft is over, or plays its next round: anyone
 * once everyone is ready, or the owner whenever they want.
 */
export const playRoomRound = (room: number) =>
  invoke('room-round', { room }, 'Não deu para jogar a rodada agora. Tente de novo.')

/** What the room's page shows of the league, as of the last round played. */
export async function loadRoomSummary(room: number): Promise<RoomSummary | undefined> {
  const { data, error } = await client()
    .from('room_rounds')
    .select('summary')
    .eq('room_id', room)
    .order('round', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw roomError(error)
  return (data?.summary as RoomSummary | undefined) ?? undefined
}

/** Tells each watch its own channel, so a page that remounts never picks up one still leaving. */
let watches = 0

/**
 * Calls back on every new pick, change to the room and change to its teams,
 * live. Returns what stops listening.
 */
export function watchRoom(
  room: number,
  on: {
    pick: (pick: DraftPick) => void
    /** Cards were dealt for a pick. */
    deal?: (deal: DraftDeal) => void
    /** The room's row changed; `clock` is the pick under way as the change tells it. */
    room: (clock: LiveClock) => void
    team: (team: DraftTeam) => void
    round?: () => void
    /** Squads, offers or the market's feed changed. */
    market?: () => void
    /** Someone joined, left, changed their team or marked "Pronto" in the waiting room. */
    members?: () => void
  },
): () => void {
  const db = client()
  const channel: RealtimeChannel = db
    .channel(`sala-${room}-${++watches}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'room_picks', filter: `room_id=eq.${room}` },
      (change) => on.pick(toDraftPick(change.new as PickRow)),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'room_deals', filter: `room_id=eq.${room}` },
      (change) => on.deal?.(toDraftDeal(change.new as DealRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room}` },
      (change) => {
        const row = change.new as Partial<RoomRow>
        on.room({
          pickNo: row.pick_no ?? 0,
          deadline: row.pick_deadline ? new Date(row.pick_deadline) : undefined,
        })
      },
    )
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_teams', filter: `room_id=eq.${room}` },
      (change) => change.new && on.team(toDraftTeam(change.new as TeamRow)),
    )
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'room_rounds', filter: `room_id=eq.${room}` },
      () => on.round?.(),
    )
  if (on.members) {
    channel.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'room_members', filter: `room_id=eq.${room}` },
      () => on.members?.(),
    )
  }
  if (on.market) {
    for (const table of ['room_rosters', 'room_trades', 'room_feed', 'room_squads']) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table, filter: `room_id=eq.${room}` },
        () => on.market?.(),
      )
    }
  }
  channel.subscribe()
  return () => {
    db.removeChannel(channel)
  }
}
