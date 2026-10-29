import { describe, expect, it } from 'vitest'
import { generateWorld } from '../engine/generate/world.ts'
import { applyPack, packSlots } from '../engine/pack/pack.ts'
import { newGame } from '../engine/season/season.ts'
import { MARKET } from '../engine/transfer/market.ts'
import { BUILT_IN_PACKS } from './index.ts'
import { CHAMPIONS_LINE, overallFromRating, PACK_LINES, withOveralls } from './ratings.ts'
import { parsePackFile } from '../engine/pack/file.ts'
import raw from './brasileirao-2026.json?raw'

// The files as room-draft imports them, parsed JSON rather than text.
const PACK_FILES = import.meta.glob<unknown>('./*.json', { eager: true, import: 'default' })

describe.each(BUILT_IN_PACKS)('the $name pack', (built) => {
  it('names every club of both divisions and fits their squads', async () => {
    const pack = await built.load()
    const world = generateWorld(1)
    expect(pack.clubs).toHaveLength(packSlots(world).length)
    for (const club of pack.clubs) {
      expect(club.name).toBeTruthy()
      expect(club.shortName).toMatch(/^[A-Z0-9]{2,4}$/)
      expect(club.colors?.primary).toMatch(/^#[0-9a-f]{6}$/i)
      expect(club.players!.length).toBeLessThanOrEqual(MARKET.maxSquad)
      const keepers = club.players!.filter((p) => p.position === 'G').length
      expect(keepers, club.name).toBeGreaterThanOrEqual(MARKET.minKeepers)
    }
    const { report } = applyPack(world, pack)
    expect(report.warnings).toEqual([])
    const names = new Set(pack.clubs.map((c) => c.name))
    expect(names.size).toBe(pack.clubs.length)
  })

  it('is rated the same by the room-draft function, which reads the file and the line itself', async () => {
    const file = PACK_FILES[`./${built.id}.json`]
    const line = PACK_LINES[built.id]
    expect(line).toBeDefined()
    const server = parsePackFile(JSON.stringify(withOveralls(file, line)), `${built.id}.json`).pack
    expect(server).toEqual(await built.load())
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

describe('the Champions League 2026/27 ratings', () => {
  const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

  it('keep each division as strong as a generated one', async () => {
    const pack = await BUILT_IN_PACKS.find((p) => p.id === 'champions-2026')!.load()
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
    expect(strength(2)).toBeLessThan(55)
  })

  it('put the strongest clubs first', async () => {
    const pack = await BUILT_IN_PACKS.find((p) => p.id === 'champions-2026')!.load()
    const best = (club: (typeof pack.clubs)[number]) =>
      average(
        club
          .players!.map((p) => p.overall!)
          .sort((a, b) => b - a)
          .slice(0, 16),
      )
    const first = pack.clubs.slice(0, 20).map(best)
    const second = pack.clubs.slice(20).map(best)
    expect(Math.min(...first)).toBeGreaterThanOrEqual(Math.max(...second))
  })
})

describe('pack ratings', () => {
  it('turn the EA FC-like scale into overalls on one fixed line', () => {
    expect(overallFromRating(83)).toBe(92)
    expect(overallFromRating(70)).toBe(66)
    expect(overallFromRating(55)).toBe(36)
    expect(overallFromRating(95)).toBe(99)
    expect(overallFromRating(90, CHAMPIONS_LINE)).toBe(88)
    expect(overallFromRating(80, CHAMPIONS_LINE)).toBe(63)
  })

  it('give every player of the Brasileirão a rating and keep overalls already set', () => {
    const file = JSON.parse(raw) as { clubes: { jogadores: Record<string, unknown>[] }[] }
    const players = file.clubes.flatMap((c) => c.jogadores)
    for (const player of players) expect(player.nota, String(player.nome)).toBeTypeOf('number')
    const rated = withOveralls({
      clubes: [{ jogadores: [{ nota: 80 }, { nota: 80, overall: 50 }] }],
    })
    expect(rated.clubes[0].jogadores).toEqual([{ overall: 86 }, { overall: 50 }])
  })
})
