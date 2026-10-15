import { describe, expect, it } from 'vitest'
import { newGame } from '../engine/season/season.ts'
import { packGame, unpackGame } from './codec.ts'

describe('packGame', () => {
  it('round-trips a career and makes it much smaller', async () => {
    const game = newGame(7, 'C40')
    const data = await packGame(game)
    expect(data.length).toBeLessThan(JSON.stringify(game).length / 4)
    expect(await unpackGame(data)).toEqual(game)
  })
})
