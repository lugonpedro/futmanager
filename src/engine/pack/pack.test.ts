import { describe, expect, it } from 'vitest'
import { generateWorld } from '../generate/world.ts'
import { newGame, playRound } from '../season/season.ts'
import { MARKET } from '../transfer/market.ts'
import {
  applyPack,
  matchSquad,
  packFromWorld,
  packIsEmpty,
  packSlots,
  restoreGeneratedNames,
  squadOrder,
  type DataPack,
} from './pack.ts'

describe('data packs', () => {
  const world = generateWorld(11)
  const slots = packSlots(world)

  it('orders the slots by division, biggest club first', () => {
    expect(slots).toHaveLength(40)
    expect(slots.slice(0, 20).every((c) => c.division === 1)).toBe(true)
    for (let i = 1; i < 20; i++) {
      expect(slots[i - 1].reputation).toBeGreaterThanOrEqual(slots[i].reputation)
    }
  })

  it('renames clubs and players, leaving the rest as generated', () => {
    const pack: DataPack = {
      name: 'Teste',
      clubs: [
        {
          name: 'Clube do Teste',
          shortName: 'CDT',
          colors: { primary: '#ff0000', secondary: '#000000' },
          players: [
            { name: 'Goleiro Um', position: 'G' },
            { position: 'G' },
            { name: 'Goleiro Três', position: 'G' },
          ],
        },
        {},
        { city: 'Cidade Nova' },
      ],
    }
    const { world: renamed, report } = applyPack(world, pack)
    const top = renamed.clubs[slots[0].id]
    expect(top).toMatchObject({ name: 'Clube do Teste', shortName: 'CDT', city: slots[0].city })
    expect(top.colors).toEqual({ primary: '#ff0000', secondary: '#000000' })
    expect(renamed.clubs[slots[1].id]).toEqual(slots[1])
    expect(renamed.clubs[slots[2].id].city).toBe('Cidade Nova')
    const keepers = squadOrder(world, slots[0]).filter((p) => p.position === 'G')
    expect(renamed.players[keepers[0].id].name).toBe('Goleiro Um')
    // The empty entry holds the second keeper's place.
    expect(renamed.players[keepers[1].id]).toEqual(keepers[1])
    expect(renamed.players[keepers[2].id].name).toBe('Goleiro Três')
    expect(report).toEqual({ clubs: 2, players: 2, warnings: [] })
    expect(renamed.players[keepers[0].id].overall).toBe(keepers[0].overall)
  })

  it('reshapes a player given an overall, age or position, the same way every time', () => {
    const squad = squadOrder(world, slots[5])
    const pack: DataPack = {
      name: '',
      clubs: Array.from({ length: 6 }, (_, i) =>
        i === 5
          ? { players: [{ name: 'Craque', position: 'A' as const, age: 20, overall: 90 }] }
          : {},
      ),
    }
    const once = applyPack(world, pack).world
    const target = squad.find((p) => p.position === 'A')!
    const player = once.players[target.id]
    expect(player).toMatchObject({ name: 'Craque', age: 20, position: 'A' })
    expect(Math.abs(player.overall - 90)).toBeLessThanOrEqual(2)
    expect(player.potential).toBeGreaterThanOrEqual(player.overall)
    expect(player.wage).toBeGreaterThan(target.wage)
    expect(applyPack(world, pack).world).toEqual(once)
  })

  it('only takes names and colours in names mode', () => {
    const pack: DataPack = {
      name: '',
      clubs: [
        { name: 'Só Nome', players: [{ name: 'Fulano', position: 'A', overall: 99, age: 18 }] },
      ],
    }
    const { world: renamed } = applyPack(world, pack, 'names')
    const striker = squadOrder(world, slots[0]).find((p) => p.position === 'A')!
    expect(renamed.players[striker.id]).toEqual({ ...striker, name: 'Fulano' })
  })

  it('moves players whose position is full and leaves out the ones beyond the squad', () => {
    const squad = squadOrder(world, slots[0])
    const keepers = Array.from({ length: 4 }, (_, i) => ({ name: `G${i}`, position: 'G' as const }))
    const { pairs, extra } = matchSquad(squad, keepers)
    expect(pairs.map(([, p]) => p.position)).toEqual(['G', 'G', 'G', 'Z'])
    expect(extra).toEqual([])
    const crowd = Array.from({ length: squad.length + 2 }, (_, i) => ({ name: `J${i}` }))
    expect(matchSquad(squad, crowd).extra).toHaveLength(2)
    const { report } = applyPack(world, { name: '', clubs: [{ players: crowd }] }, 'names')
    expect(report.warnings).toHaveLength(1)
  })

  it('signs the players beyond a generated squad, up to the market limit', () => {
    const crowd = Array.from({ length: MARKET.maxSquad + 2 }, (_, i) => ({
      name: `J${i}`,
      position: 'A' as const,
      overall: 60,
    }))
    const { world: bigger, report } = applyPack(world, { name: '', clubs: [{ players: crowd }] })
    const club = bigger.clubs[slots[0].id]
    expect(club.playerIds).toHaveLength(MARKET.maxSquad)
    expect(report.warnings).toHaveLength(1)
    const signed = club.playerIds.slice(slots[0].playerIds.length).map((id) => bigger.players[id])
    for (const player of signed) {
      expect(player.clubId).toBe(slots[0].id)
      expect(player.position).toBe('A')
      expect(player.overall).toBe(60)
      expect(player.name).toMatch(/^J\d+$/)
    }
    expect(applyPack(world, { name: '', clubs: [{ players: crowd }] }).world).toEqual(bigger)
  })

  it('round-trips a world through a pack', () => {
    const other = generateWorld(12)
    const { world: copied } = applyPack(other, packFromWorld(world, 'cópia'), 'names')
    const names = (w: typeof world) => packSlots(w).map((c) => c.name)
    expect(names(copied)).toEqual(names(world))
    expect(packIsEmpty(packFromWorld(world, ''))).toBe(false)
    expect(packIsEmpty({ name: '', clubs: [{}, { players: [{ position: 'G' }] }] })).toBe(true)
  })

  it('puts the generated names back', () => {
    const { world: renamed } = applyPack(world, packFromWorld(generateWorld(99), 'outro'), 'names')
    expect(restoreGeneratedNames(renamed)).toEqual(world)
  })

  it('starts a playable career with a pack', () => {
    const pack: DataPack = { name: 'Meu pacote', clubs: [{ name: 'Primeiro FC' }] }
    const game = newGame(11, slots[0].id, pack)
    expect(game.world.clubs[slots[0].id].name).toBe('Primeiro FC')
    expect(game.names).toEqual({ pack: 'Meu pacote' })
    expect(newGame(11, slots[0].id).names).toEqual({})
    expect(playRound(game).season.round).toBe(2)
  })
})
