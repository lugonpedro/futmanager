import type { SupabaseClient } from '@supabase/supabase-js'
import { db, type SaveSlot } from '../db/saves.ts'
import { SAVE_VERSION } from '../engine/season/season.ts'
import { packGame, unpackGame } from './codec.ts'
import { planSync, type SyncBase, type SyncStep } from './plan.ts'

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
  /** Something for the player, like a save from a newer version. */
  notes: string[]
  /** How many careers this account can keep in the cloud. */
  cloudSlots: number
  /** The careers in the account once the sync is done. */
  cloud: RemoteSave[]
}

/** Careers a free account keeps in the cloud; the server holds each account's real number. */
export const FREE_CLOUD_SLOTS = 1
/** Careers a paying player keeps in the cloud. */
export const PAID_CLOUD_SLOTS = 5

const SUMMARY = 'id, club_name, year, round, today, season_over, updated_at, version'

async function listRemote(client: SupabaseClient): Promise<RemoteSave[]> {
  const { data, error } = await client.from('saves').select(SUMMARY)
  if (error) throw error
  return data as RemoteSave[]
}

async function cloudSlotsOf(client: SupabaseClient, userId: string): Promise<number> {
  const { data, error } = await client
    .from('entitlements')
    .select('cloud_slots')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as { cloud_slots: number } | null)?.cloud_slots ?? FREE_CLOUD_SLOTS
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

async function deleteRemote(client: SupabaseClient, id: string, base?: number) {
  // Given a base, only if no other device saved it since; otherwise it stays for the next sync.
  let query = client.from('saves').delete().eq('id', id)
  if (base !== undefined) query = query.eq('updated_at', base)
  const { error } = await query
  if (error) throw error
  await db.synced.delete(id)
}

function describeError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : String((error as { message?: string }).message ?? error)
  if (message.includes('save limit reached')) return 'A nuvem da sua conta já está cheia.'
  return message
}

/**
 * Brings this device and the account up to date with each other. Careers the
 * account has never seen go up while there is room, the most recently played
 * first; the rest stay only on this device.
 */
export async function syncAll(client: SupabaseClient, userId: string): Promise<SyncReport> {
  const [remote, local, bases, cloudSlots] = await Promise.all([
    listRemote(client),
    db.saves.toArray(),
    db.synced.toArray(),
    cloudSlotsOf(client, userId),
  ])
  const slots = new Map(local.map((s) => [s.id, s]))
  const rows = new Map(remote.map((r) => [r.id, r]))
  const report: SyncReport = { conflicts: [], downloaded: [], notes: [], cloudSlots, cloud: [] }
  const note = (error: unknown) => {
    const text = describeError(error)
    if (!report.notes.includes(text)) report.notes.push(text)
  }
  let newer = 0

  const steps = planSync(
    userId,
    local,
    remote.map((r) => ({ id: r.id, updatedAt: r.updated_at })),
    bases,
  )
  const isNew = (step: SyncStep) => step.kind === 'upload' && !rows.has(step.id)
  for (const step of steps.filter((step) => !isNew(step))) {
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
      note(error)
    }
  }

  let room = cloudSlots - (await listRemote(client)).length
  const fresh = steps
    .filter(isNew)
    .map((step) => slots.get(step.id)!)
    .sort((a, b) => b.updatedAt - a.updatedAt)
  for (const slot of fresh) {
    if (room <= 0) break
    try {
      if (await upload(client, userId, slot, undefined)) room--
    } catch (error) {
      note(error)
    }
  }

  if (newer > 0) {
    report.notes.push(
      'Há carreiras salvas por uma versão mais nova do jogo. Atualize a página para trazê-las.',
    )
  }
  report.cloud = await listRemote(client)
  return report
}

/**
 * Puts a career that is only on this device into the cloud, taking the place
 * of `replacing` when the account has no room. The replaced career leaves the
 * cloud and the other devices, but stays on this one.
 */
export async function moveToCloud(
  client: SupabaseClient,
  userId: string,
  id: string,
  replacing?: string,
) {
  const slot = await db.saves.get(id)
  if (!slot) return
  if (replacing) await deleteRemote(client, replacing)
  await db.synced.delete(id)
  await upload(client, userId, slot, undefined)
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
