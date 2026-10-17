import Dexie, { type EntityTable } from 'dexie'
import type { SyncBase } from '../cloud/plan.ts'
import type { GameState } from '../engine/model/types.ts'
import { upgradeGame } from '../engine/save.ts'
import { isSeasonOver } from '../engine/season/season.ts'

/** One career in its own slot, with enough on the side to list it without loading the game. */
export type SaveSlot = {
  id: string
  clubId: string
  clubName: string
  year: number
  round: number
  /** The career's date; slots written before the calendar have none. */
  today?: string
  seasonOver: boolean
  updatedAt: number
  game: GameState
}

export type SaveInfo = Omit<SaveSlot, 'game'>

class SavesDb extends Dexie {
  saves!: EntityTable<SaveSlot, 'id'>
  /** What each slot looked like at its last sync with an account. */
  synced!: EntityTable<SyncBase, 'id'>
  constructor() {
    // Keeps the old name: renaming the database would hide every existing save.
    super('futmanager')
    this.version(1).stores({ saves: 'id, updatedAt' })
    this.version(2).stores({ saves: 'id, updatedAt', synced: 'id' })
  }
}

export const db = new SavesDb()

export const newSlotId = () =>
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`

export function slotOf(id: string, game: GameState, updatedAt = Date.now()): SaveSlot {
  return {
    id,
    clubId: game.userClubId,
    clubName: game.world.clubs[game.userClubId].name,
    year: game.season.year,
    round: game.season.round,
    today: game.today,
    seasonOver: isSeasonOver(game.season),
    updatedAt,
    game,
  }
}

/** Every career, the most recently played first, without the games themselves. */
export async function listSaves(): Promise<SaveInfo[]> {
  const slots = await db.saves.orderBy('updatedAt').reverse().toArray()
  return slots.map((slot) => {
    const info: Partial<SaveSlot> = { ...slot }
    delete info.game
    return info as SaveInfo
  })
}

/** Writes a career to its slot, or to a new one when no id is given; returns the slot id. */
export async function writeSave(game: GameState, id = newSlotId()): Promise<string> {
  await db.saves.put(slotOf(id, game))
  return id
}

/** Reads a career, upgrading it if it was saved by an older version of the game. */
export async function readSave(id: string): Promise<GameState | undefined> {
  const slot = await db.saves.get(id)
  return slot && upgradeGame(slot.game)
}

/** Deletes a career; if it was in the cloud, the next sync deletes it there too. */
export function deleteSave(id: string) {
  return db.transaction('rw', db.saves, db.synced, async () => {
    await db.saves.delete(id)
    await db.synced.update(id, { deleted: true })
  })
}
