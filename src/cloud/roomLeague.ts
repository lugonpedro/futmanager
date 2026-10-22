import type { MatchReplay } from '../engine/match/simulate.ts'
import type { Lineup } from '../engine/model/types.ts'
import type { RoomMatchLine, RoomSummary, TeamSheet } from '../engine/room/summary.ts'
import { supabase } from './client.ts'
import { unpackJson } from './codec.ts'
import { roomError } from './rooms.ts'

function client() {
  if (!supabase) throw new Error('O jogo online não está disponível nesta versão.')
  return supabase
}

/** What a team needs to set its lineup for the coming round, as the last round left it. */
export async function loadTeamSheet(room: number, slot: number): Promise<TeamSheet | undefined> {
  const { data, error } = await client()
    .from('room_squads')
    .select('data')
    .eq('room_id', room)
    .eq('slot', slot)
    .maybeSingle()
  if (error) throw roomError(error)
  return (data?.data as TeamSheet | undefined) ?? undefined
}

/** The lineup the player saved for a round, if they saved one for it. */
export async function loadSavedLineup(room: number, round: number): Promise<Lineup | undefined> {
  const { data, error } = await client()
    .from('room_lineups')
    .select('lineup')
    .eq('room_id', room)
    .eq('round', round)
    .maybeSingle()
  if (error) throw roomError(error)
  return (data?.lineup as Lineup | undefined) ?? undefined
}

export async function saveRoomLineup(room: number, lineup: Lineup): Promise<void> {
  const { error } = await client().rpc('save_room_lineup', { room, lineup })
  if (error) throw roomError(error)
}

/** Marks or unmarks the player as ready; true when that made everyone ready. */
export async function setRoomReady(room: number, on: boolean): Promise<boolean> {
  const { data, error } = await client().rpc('room_ready', { room, on_ready: on })
  if (error) throw roomError(error)
  return data === true
}

/** The matches of a round played, to watch again. */
export async function loadRoundReplays(room: number, round: number): Promise<MatchReplay[]> {
  const { data, error } = await client()
    .from('room_rounds')
    .select('replays')
    .eq('room_id', room)
    .eq('round', round)
    .maybeSingle()
  if (error) throw roomError(error)
  return data?.replays ? unpackJson<MatchReplay[]>(data.replays) : []
}

/** Opens the "Revanche" room, or finds the one someone opened already; its id. */
export async function rematchRoom(room: number): Promise<number> {
  const { data, error } = await client().rpc('room_rematch', { room })
  if (error) throw roomError(error)
  return data as number
}

/** The results of every round played so far, the first first. */
export async function loadRoundResults(
  room: number,
): Promise<{ round: number; matches: RoomMatchLine[] }[]> {
  const { data, error } = await client()
    .from('room_rounds')
    .select('round, last:summary->last')
    .eq('room_id', room)
    .gt('round', 0)
    .order('round')
  if (error) throw roomError(error)
  return (data as { round: number; last: RoomMatchLine[] | null }[]).map((row) => ({
    round: row.round,
    matches: row.last ?? [],
  }))
}

/** A round as it was played: when, the table after it and its matches to replay. */
export async function loadPlayedRound(
  room: number,
  round: number,
): Promise<
  { playedAt: Date; spedAt?: Date; summary: RoomSummary; replays: MatchReplay[] } | undefined
> {
  const { data, error } = await client()
    .from('room_rounds')
    .select('played_at, sped_at, summary, replays')
    .eq('room_id', room)
    .eq('round', round)
    .maybeSingle()
  if (error) throw roomError(error)
  if (!data) return undefined
  return {
    playedAt: new Date(data.played_at),
    spedAt: data.sped_at ? new Date(data.sped_at) : undefined,
    summary: data.summary as RoomSummary,
    replays: data.replays ? await unpackJson<MatchReplay[]>(data.replays) : [],
  }
}

/** Who asked to speed up a round shown live, and when it sped up, once everyone had. */
export async function loadSpeedUp(
  room: number,
  round: number,
): Promise<{ asked: number[]; spedAt?: Date }> {
  const [asked, played] = await Promise.all([
    client().from('room_speedups').select('slot').eq('room_id', room).eq('round', round),
    client()
      .from('room_rounds')
      .select('sped_at')
      .eq('room_id', room)
      .eq('round', round)
      .maybeSingle(),
  ])
  if (asked.error) throw roomError(asked.error)
  if (played.error) throw roomError(played.error)
  return {
    asked: (asked.data as { slot: number }[]).map((row) => row.slot),
    spedAt: played.data?.sped_at ? new Date(played.data.sped_at) : undefined,
  }
}

/** Asks for the round to go faster; true when that made everyone ask. */
export async function speedUpRound(room: number, round: number): Promise<boolean> {
  const { data, error } = await client().rpc('room_speed_up', { room, round })
  if (error) throw roomError(error)
  return data === true
}
