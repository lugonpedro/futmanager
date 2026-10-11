import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { newGame, playRound, SAVE_VERSION } from '../engine/season/season.ts'
import {
  db,
  deleteSave,
  exportSave,
  listSaves,
  parseSaveFile,
  readSave,
  saveFileName,
  writeSave,
} from './saves.ts'

const game = newGame(4, 'C7')

describe('save slots', () => {
  beforeEach(() => db.saves.clear())

  it('keeps each career in its own slot, newest first', async () => {
    const first = await writeSave(game)
    const later = playRound(newGame(5, 'C30'))
    const second = await writeSave(later)
    expect(first).not.toBe(second)
    const saves = await listSaves()
    expect(saves.map((s) => s.id)).toEqual([second, first])
    expect(saves[0]).toMatchObject({ clubId: 'C30', year: 2027, round: 2, seasonOver: false })
    expect(saves[0]).not.toHaveProperty('game')
    expect(await readSave(first)).toEqual(game)
  })

  it('overwrites a slot when saving to it again, and deletes it', async () => {
    const id = await writeSave(game)
    const next = playRound(game)
    await writeSave(next, id)
    expect((await listSaves()).map((s) => s.round)).toEqual([2])
    expect((await readSave(id))?.season.round).toBe(2)
    await deleteSave(id)
    expect(await listSaves()).toEqual([])
    expect(await readSave(id)).toBeUndefined()
  })
})

describe('save files', () => {
  it('round-trips a career through a file', () => {
    expect(parseSaveFile(exportSave(game))).toEqual(game)
    expect(saveFileName(game)).toMatch(/^futmanager-[a-z0-9-]+-2027\.json$/)
  })

  it('refuses anything that is not a save, or one from a newer version', () => {
    expect(() => parseSaveFile('não é json')).toThrow('não é um save')
    expect(() => parseSaveFile('{"format":"outro"}')).toThrow('não é um save')
    const future = JSON.stringify({ format: 'futmanager-save', version: SAVE_VERSION + 1, game })
    expect(() => parseSaveFile(future)).toThrow('versão mais nova')
  })
})
