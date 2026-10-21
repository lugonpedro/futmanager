import type { MatchReplay } from '../engine/match/simulate.ts'
import type { Lineup } from '../engine/model/types.ts'
import type { TeamSheet } from '../engine/room/summary.ts'
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
