import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { newGame, playRound } from '../engine/season/season.ts'
import { db, deleteSave, listSaves, readSave, writeSave } from './saves.ts'

const game = newGame(4, 'C7')

describe('save slots', () => {
  beforeEach(() => Promise.all([db.saves.clear(), db.synced.clear()]))

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

  it('remembers that a synced career was deleted, so the cloud copy goes too', async () => {
    const id = await writeSave(game)
    await db.synced.put({ id, userId: 'user-1', updatedAt: 5 })
    await deleteSave(id)
    expect(await db.synced.get(id)).toEqual({ id, userId: 'user-1', updatedAt: 5, deleted: true })
  })
})
