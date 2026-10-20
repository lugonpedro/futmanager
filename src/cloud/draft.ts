import type { RealtimeChannel } from '@supabase/supabase-js'
import type { PoolPlayer } from '../engine/room/start.ts'
import type { RoomSummary } from '../engine/room/summary.ts'
import type { TeamIdentity } from '../engine/room/team.ts'
import { supabase } from './client.ts'
import { roomError } from './rooms.ts'

/** A team of a room once the draft started: a person's or a robot's, by its place. */
export type DraftTeam = TeamIdentity & {
  slot: number
  userId?: string
  robot: boolean
  /** Picking on its own: switched on, or after two missed picks in a row. */
  auto: boolean
}

export type DraftPick = { pick: number; slot: number; playerId: string; auto: boolean }

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
}

export const toDraftTeam = (row: TeamRow): DraftTeam => ({
  slot: row.slot,
  userId: row.user_id ?? undefined,
  name: row.team_name,
  shortName: row.short_name,
  colors: { primary: row.color_primary, secondary: row.color_secondary },
  robot: row.robot,
  auto: row.auto,
})

type PickRow = { pick: number; slot: number; player_id: string; auto: boolean }

export const toDraftPick = (row: PickRow): DraftPick => ({
  pick: row.pick,
  slot: row.slot,
  playerId: row.player_id,
  auto: row.auto,
})

export async function loadDraftTeams(room: number): Promise<DraftTeam[]> {
  const { data, error } = await client()
    .from('room_teams')
    .select('slot, user_id, team_name, short_name, color_primary, color_secondary, robot, auto')
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
      .select('pick, slot, player_id, auto')
      .eq('room_id', room)
      .order('pick')
      .range(from, from + PAGE - 1)
    if (error) throw roomError(error)
    picks.push(...(data as PickRow[]).map(toDraftPick))
    if (data.length < PAGE) return picks
  }
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

/** The player's queue of favourites in the room, in their order. */
export async function loadDraftQueue(room: number, userId: string): Promise<string[]> {
  const { data, error } = await client()
    .from('room_queues')
    .select('player_ids')
    .eq('room_id', room)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw roomError(error)
  return (data?.player_ids as string[] | undefined) ?? []
}

export async function saveDraftQueue(room: number, playerIds: readonly string[]): Promise<void> {
  const { error } = await client().rpc('save_draft_queue', { room, player_ids: playerIds })
  if (error) throw roomError(error)
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

export async function setDraftAuto(room: number, on: boolean): Promise<void> {
  const { error } = await client().rpc('draft_set_auto', { room, on_auto: on })
  if (error) throw roomError(error)
}

/** Calls one of the room's server functions, with the message it answers on failure. */
async function invoke(name: string, room: number, fallback: string): Promise<void> {
  const { data, error } = await client().functions.invoke(name, { body: { room } })
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => undefined)
    throw new Error(body?.error ?? fallback)
  }
  if (data?.error) throw new Error(data.error)
}

/** Starts the draft of a waiting room now; only its owner can. */
export const startDraftNow = (room: number) =>
  invoke('room-draft', room, 'Não deu para começar o draft agora. Tente de novo.')

/** Starts the league once the draft is over, or plays its next round; only the owner can. */
export const playRoomRound = (room: number) =>
  invoke('room-round', room, 'Não deu para jogar a rodada agora. Tente de novo.')

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

/**
 * Calls back on every new pick, change to the room and change to its teams,
 * live. Returns what stops listening.
 */
export function watchRoom(
  room: number,
  on: {
    pick: (pick: DraftPick) => void
    room: () => void
    team: (team: DraftTeam) => void
    round?: () => void
  },
): () => void {
  const db = client()
  const channel: RealtimeChannel = db
    .channel(`sala-${room}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'room_picks', filter: `room_id=eq.${room}` },
      (change) => on.pick(toDraftPick(change.new as PickRow)),
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'rooms', filter: `id=eq.${room}` },
      () => on.room(),
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
    .subscribe()
  return () => {
    db.removeChannel(channel)
  }
}
