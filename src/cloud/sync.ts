import type { SupabaseClient } from '@supabase/supabase-js'
import { db, type SaveSlot } from '../db/saves.ts'
import { SAVE_VERSION } from '../engine/season/season.ts'
import { packGame, unpackGame } from './codec.ts'
import { planSync, type SyncBase } from './plan.ts'

/** A career in the account, without the game itself. */
export type RemoteSave = {
  id: string
  club_name: string
  year: number
  round: number
  today: string | null
  season_over: boolean
  updated_at: number
  version: number
}

/** The same career saved differently here and in the account. */
export type SyncConflict = { id: string; local: SaveSlot; remote: RemoteSave }

export type SyncReport = {
  conflicts: SyncConflict[]
  /** Slots whose game was replaced by the account's copy. */
  downloaded: string[]
  /** Something for the player, like the slot limit or a save from a newer version. */
  notes: string[]
}

/** Careers an account can keep in the cloud, as set on the server. */
export const CLOUD_SLOTS = 10

const SUMMARY = 'id, club_name, year, round, today, season_over, updated_at, version'

async function listRemote(client: SupabaseClient): Promise<RemoteSave[]> {
  const { data, error } = await client.from('saves').select(SUMMARY)
  if (error) throw error
  return data as RemoteSave[]
}

async function remember(base: SyncBase) {
  await db.synced.put(base)
}

/** Sends one career; false when the account has a copy saved elsewhere in between. */
async function upload(
  client: SupabaseClient,
  userId: string,
  slot: SaveSlot,
  base: number | undefined,
): Promise<boolean> {
  const { data, error } = await client.rpc('push_save', {
    p_id: slot.id,
    p_club_name: slot.clubName,
    p_year: slot.year,
    p_round: slot.round,
    p_today: slot.today ?? null,
    p_season_over: slot.seasonOver,
    p_updated_at: slot.updatedAt,
    p_version: slot.game.version ?? SAVE_VERSION,
    p_data: await packGame(slot.game),
    p_base_updated_at: base ?? null,
  })
  if (error) throw error
  if (data === true) await remember({ id: slot.id, userId, updatedAt: slot.updatedAt })
  return data === true
}

/** Replaces this device's copy with the account's; false if it's from a newer game. */
async function download(client: SupabaseClient, userId: string, id: string): Promise<boolean> {
  const { data, error } = await client
    .from('saves')
    .select(`${SUMMARY}, data`)
    .eq('id', id)
    .single()
  if (error) throw error
  const row = data as RemoteSave & { data: string }
  if (row.version > SAVE_VERSION) return false
  const game = await unpackGame(row.data)
  await db.transaction('rw', db.saves, db.synced, async () => {
    await db.saves.put({
      id,
      clubId: game.userClubId,
      clubName: row.club_name,
      year: row.year,
      round: row.round,
      today: row.today ?? undefined,
      seasonOver: row.season_over,
      updatedAt: row.updated_at,
      game,
    })
    await db.synced.put({ id, userId, updatedAt: row.updated_at })
  })
  return true
}

async function deleteRemote(client: SupabaseClient, id: string, base: number) {
  // Only if no other device saved it since; otherwise it stays for the next sync.
  const { error } = await client.from('saves').delete().eq('id', id).eq('updated_at', base)
  if (error) throw error
  await db.synced.delete(id)
}

function describeError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: string }).message ?? error)
  if (message.includes('save limit reached')) {
    return `Sua conta já tem ${CLOUD_SLOTS} carreiras na nuvem. Apague alguma para guardar outra.`
  }
  return message
}

/** Brings this device and the account up to date with each other. */
export async function syncAll(client: SupabaseClient, userId: string): Promise<SyncReport> {
  const [remote, local, bases] = await Promise.all([
    listRemote(client),
    db.saves.toArray(),
    db.synced.toArray(),
  ])
  const slots = new Map(local.map((s) => [s.id, s]))
  const rows = new Map(remote.map((r) => [r.id, r]))
  const report: SyncReport = { conflicts: [], downloaded: [], notes: [] }
  let newer = 0

  for (const step of planSync(
    userId,
    local,
    remote.map((r) => ({ id: r.id, updatedAt: r.updated_at })),
    bases,
  )) {
    try {
      switch (step.kind) {
        case 'upload':
          await upload(client, userId, slots.get(step.id)!, step.base)
          break
        case 'download':
          if (await download(client, userId, step.id)) report.downloaded.push(step.id)
          else newer++
          break
        case 'deleteRemote':
          await deleteRemote(client, step.id, step.base)
          break
        case 'deleteLocal':
          await db.transaction('rw', db.saves, db.synced, async () => {
            await db.saves.delete(step.id)
            await db.synced.delete(step.id)
          })
          break
        case 'mark':
          await remember({ id: step.id, userId, updatedAt: step.updatedAt })
          break
        case 'forget':
          await db.synced.delete(step.id)
          break
        case 'conflict':
          report.conflicts.push({
            id: step.id,
            local: slots.get(step.id)!,
            remote: rows.get(step.id)!,
          })
          break
      }
    } catch (error) {
      const note = describeError(error)
      if (!report.notes.includes(note)) report.notes.push(note)
    }
  }
  if (newer > 0) {
    report.notes.push(
      'Há carreiras salvas por uma versão mais nova do jogo. Atualize a página para trazê-las.',
    )
  }
  return report
}

/** Settles a conflict with the copy the player chose; true if the slot's game changed here. */
export async function resolveConflict(
  client: SupabaseClient,
  userId: string,
  conflict: SyncConflict,
  keep: 'local' | 'remote',
): Promise<boolean> {
  if (keep === 'remote') return download(client, userId, conflict.id)
  const slot = await db.saves.get(conflict.id)
  if (slot) await upload(client, userId, slot, conflict.remote.updated_at)
  return false
}

/**
 * Sends a career just saved during play, if the account still has the copy
 * this device last saw. Anything else waits for the next full sync.
 */
export async function pushSlot(client: SupabaseClient, userId: string, id: string) {
  const [slot, base] = await Promise.all([db.saves.get(id), db.synced.get(id)])
  if (!slot) return
  const known = base?.userId === userId ? base : undefined
  if (known?.updatedAt === slot.updatedAt) return
  try {
    await upload(client, userId, slot, known?.updatedAt)
  } catch (error) {
    console.error(describeError(error))
  }
}
