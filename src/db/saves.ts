import Dexie, { type EntityTable } from 'dexie'
import type { SyncBase } from '../cloud/plan.ts'
import type { GameState } from '../engine/model/types.ts'
import { upgradeGame } from '../engine/save.ts'
import { isSeasonOver, SAVE_VERSION } from '../engine/season/season.ts'

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

const FILE_FORMAT = 'futmanager-save'

/** A career as a JSON file the player can keep or move to another device. */
export function exportSave(game: GameState): string {
  return JSON.stringify({ format: FILE_FORMAT, version: SAVE_VERSION, game })
}

/** Reads a file made by exportSave(); throws with a message for the player when it isn't one. */
export function parseSaveFile(text: string): GameState {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new Error('O arquivo não é um save do futmanager.')
  }
  const file = data as { format?: string; version?: number; game?: GameState }
  if (file?.format !== FILE_FORMAT || !file.game?.world || !file.game.season) {
    throw new Error('O arquivo não é um save do futmanager.')
  }
  if ((file.version ?? 0) > SAVE_VERSION) {
    throw new Error(
      'Este save é de uma versão mais nova do jogo. Atualize a página e tente de novo.',
    )
  }
  return upgradeGame(file.game)
}

/** File name for an exported career, like futmanager-barra-verde-2029.json. */
export function saveFileName(game: GameState): string {
  const club = game.world.clubs[game.userClubId].name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
  return `futmanager-${club}-${game.season.year}.json`
}
