import { describe, expect, it } from 'vitest'
import { generateWorld, SQUAD_SHAPE } from '../engine/generate/world.ts'
import { applyPack, packSlots } from '../engine/pack/pack.ts'
import { POSITIONS } from '../engine/model/types.ts'
import { newGame } from '../engine/season/season.ts'
import { BUILT_IN_PACKS } from './index.ts'

const squadSize = Object.values(SQUAD_SHAPE).reduce((a, b) => a + b, 0)

describe.each(BUILT_IN_PACKS)('the $name pack', (built) => {
  it('names every club of both divisions and fits their squads', async () => {
    const pack = await built.load()
    const world = generateWorld(1)
    expect(pack.clubs).toHaveLength(packSlots(world).length)
    for (const club of pack.clubs) {
      expect(club.name).toBeTruthy()
      expect(club.shortName).toMatch(/^[A-Z0-9]{2,4}$/)
      expect(club.colors?.primary).toMatch(/^#[0-9a-f]{6}$/i)
      expect(club.players!.length).toBeLessThanOrEqual(squadSize)
      for (const position of POSITIONS) {
        const count = club.players!.filter((p) => p.position === position).length
        expect(count, `${club.name} ${position}`).toBeLessThanOrEqual(SQUAD_SHAPE[position])
      }
    }
    const { report } = applyPack(world, pack)
    expect(report.warnings).toEqual([])
    const names = new Set(pack.clubs.map((c) => c.name))
    expect(names.size).toBe(pack.clubs.length)
  })

  it('starts a career with its names', async () => {
    const pack = await built.load()
    const game = newGame(5, packSlots(generateWorld(5))[0].id, pack)
    expect(game.names.pack).toBe(built.name)
    expect(game.world.clubs[game.userClubId].name).toBe(pack.clubs[0].name)
  })
})

describe('the Brasileirão 2026 ratings', () => {
  const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

  it('keep each division as strong as a generated one', async () => {
    const pack = await BUILT_IN_PACKS.find((p) => p.id === 'brasileirao-2026')!.load()
    const { world } = applyPack(generateWorld(3), pack)
    const strength = (division: number) =>
      average(
        Object.values(world.clubs)
          .filter((c) => c.division === division)
          .flatMap((c) => c.playerIds.map((id) => world.players[id].overall)),
      )
    expect(strength(1)).toBeGreaterThan(62)
    expect(strength(1)).toBeLessThan(72)
    expect(strength(2)).toBeGreaterThan(39)
    expect(strength(2)).toBeLessThan(50)
  })

  it('leave no room to grow for players past 29', async () => {
    const pack = await BUILT_IN_PACKS.find((p) => p.id === 'brasileirao-2026')!.load()
    const { world } = applyPack(generateWorld(3), pack)
    const veterans = pack.clubs
      .flatMap((c) => c.players!)
      .filter((p) => p.age !== undefined && p.age > 29)
      .map((p) => p.name)
    const named = Object.values(world.players).filter((p) => veterans.includes(p.name))
    expect(named.length).toBeGreaterThan(300)
    for (const player of named) {
      if (player.age > 29) expect(player.potential, player.name).toBe(player.overall)
    }
  })
})
