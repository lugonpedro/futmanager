// Reading and writing a room's state for room-round and room-market. Each
// write checks the version it read (see 20261030000000_mercado.sql), so a
// trade and a round at the same moment never undo each other: the second
// write fails and its caller starts over from the fresh state.
import type { SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { packJson, unpackJson } from '../../../src/cloud/codec.ts'
import { FREE_AGENT } from '../../../src/engine/model/types.ts'
import { teamSheet } from '../../../src/engine/room/summary.ts'
import type { RoomState } from '../../../src/engine/room/types.ts'

export const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

/** Tries before giving up when other writes keep landing first. */
export const ATTEMPTS = 3

export async function loadState(
  db: SupabaseClient,
  room: number,
): Promise<{ state: RoomState; version: number }> {
  const { data, error } = await db
    .from('room_states')
    .select('data, version')
    .eq('room_id', room)
    .single()
  if (error) throw error
  if (!data.data) throw new Error(`Room ${room} has no state`)
  return { state: await unpackJson<RoomState>(data.data), version: data.version }
}

/** Saves the state if nobody saved since `version` was read; false when someone did. */
export async function saveState(
  db: SupabaseClient,
  room: number,
  state: RoomState,
  version: number,
): Promise<boolean> {
  const { data, error } = await db
    .from('room_states')
    .update({ data: await packJson(state), version: version + 1 })
    .eq('room_id', room)
    .eq('version', version)
    .select('room_id')
  if (error) throw error
  return data.length === 1
}

/** Mirrors who plays where, and who was released, for the room's page. */
export async function writeRosters(db: SupabaseClient, room: number, state: RoomState) {
  const rows = [
    ...Object.entries(state.squads).flatMap(([teamId, ids]) =>
      ids.map((id) => ({
        room_id: room,
        player_id: id,
        slot: Number(teamId),
        claimable_from: null,
      })),
    ),
    ...Object.entries(state.released)
      .filter(([id]) => state.players[id]?.clubId === FREE_AGENT)
      .map(([id, from]) => ({ room_id: room, player_id: id, slot: null, claimable_from: from })),
  ]
  const cleared = await db.from('room_rosters').delete().eq('room_id', room)
  if (cleared.error) throw cleared.error
  const written = await db.from('room_rosters').insert(rows)
  if (written.error) throw written.error
}

/** What each of these teams needs to set its lineup for the coming round. */
export async function writeSheets(
  db: SupabaseClient,
  room: number,
  state: RoomState,
  teamIds: readonly string[] = state.teams.map((t) => t.id),
) {
  const { error } = await db
    .from('room_squads')
    .upsert(teamIds.map((id) => ({ room_id: room, slot: Number(id), data: teamSheet(state, id) })))
  if (error) throw error
}
