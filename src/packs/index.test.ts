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
