import { describe, expect, it } from 'vitest'
import { generateWorld } from '../generate/world.ts'
import type { Formation, Position } from '../model/types.ts'
import {
  autoFormation,
  autoLineup,
  BENCH_SIZE,
  changeFormation,
  FORMATION_LIST,
  FORMATIONS,
  repairLineup,
  swapPlayers,
} from './lineup.ts'

const world = generateWorld(2027)
const squad = world.clubs.C1.playerIds.map((id) => world.players[id])

const countBy = (positions: Position[]) =>
  positions.reduce<Record<string, number>>(
    (counts, p) => ({ ...counts, [p]: (counts[p] ?? 0) + 1 }),
    {},
  )

describe('autoLineup', () => {
  it.each(Object.keys(FORMATIONS) as Formation[])('fills every slot of a %s', (formation) => {
    const lineup = autoLineup(squad, formation)
    expect(lineup.starters).toHaveLength(11)
    const expected = Object.entries(FORMATIONS[formation]).filter(([, count]) => count > 0)
    expect(countBy(lineup.starters.map((s) => s.position))).toEqual(Object.fromEntries(expected))
    for (const { playerId, position } of lineup.starters) {
      expect(world.players[playerId].position, playerId).toBe(position)
    }
  })

  it('picks the strongest player for each position', () => {
    const lineup = autoLineup(squad)
    const starters = new Set(lineup.starters.map((s) => s.playerId))
    const keepers = squad.filter((p) => p.position === 'G').sort((a, b) => b.strength - a.strength)
    expect(starters.has(keepers[0].id)).toBe(true)
    expect(starters.has(keepers[1].id)).toBe(false)
  })

  it('puts a reserve keeper on a full bench, without repeating starters', () => {
    const lineup = autoLineup(squad)
    expect(lineup.bench).toHaveLength(BENCH_SIZE)
    expect(world.players[lineup.bench[0]].position).toBe('G')
    const starters = new Set(lineup.starters.map((s) => s.playerId))
    for (const id of lineup.bench) expect(starters.has(id)).toBe(false)
  })

  it('leaves out unavailable players and covers the gap with a neighbour', () => {
    const forwards = squad.filter((p) => p.position === 'A')
    const lineup = autoLineup(squad, '4-3-3', 'normal', new Set(forwards.slice(1).map((p) => p.id)))
    const attackers = lineup.starters.filter((s) => s.position === 'A')
    expect(attackers).toHaveLength(3)
    expect(attackers.map((s) => world.players[s.playerId].position).sort()).toEqual(['A', 'M', 'M'])
  })
})

const positionsOf = (starters: { position: Position }[]) => countBy(starters.map((s) => s.position))
const expectedShape = (formation: Formation) =>
  Object.fromEntries(Object.entries(FORMATIONS[formation]).filter(([, count]) => count > 0))

describe('changeFormation', () => {
  it('keeps the same eleven and reshapes them', () => {
    const lineup = autoLineup(squad, '4-4-2')
    const changed = changeFormation(lineup, '3-5-2', world.players)
    expect(changed.formation).toBe('3-5-2')
    expect(positionsOf(changed.starters)).toEqual(expectedShape('3-5-2'))
    expect(changed.starters.map((s) => s.playerId).sort()).toEqual(
      lineup.starters.map((s) => s.playerId).sort(),
    )
    expect(changed.bench).toEqual(lineup.bench)
  })

  it('keeps the keeper in goal', () => {
    const lineup = autoLineup(squad, '4-4-2')
    const keeper = lineup.starters.find((s) => s.position === 'G')!.playerId
    for (const formation of FORMATION_LIST) {
      const changed = changeFormation(lineup, formation, world.players)
      expect(changed.starters.find((s) => s.position === 'G')!.playerId).toBe(keeper)
    }
  })
})

describe('swapPlayers', () => {
  const lineup = autoLineup(squad, '4-4-2')
  const [first, second] = lineup.starters

  it('trades the places of two starters', () => {
    const swapped = swapPlayers(lineup, first.playerId, second.playerId)
    expect(swapped.starters[0]).toEqual({ playerId: second.playerId, position: first.position })
    expect(swapped.starters[1]).toEqual({ playerId: first.playerId, position: second.position })
  })

  it('sends a starter to the bench in place of a sub', () => {
    const sub = lineup.bench[2]
    const swapped = swapPlayers(lineup, first.playerId, sub)
    expect(swapped.starters[0]).toEqual({ playerId: sub, position: first.position })
    expect(swapped.bench[2]).toBe(first.playerId)
  })

  it('drops a starter to the stands for a player outside the lineup', () => {
    const used = new Set([...lineup.starters.map((s) => s.playerId), ...lineup.bench])
    const outsider = squad.find((p) => !used.has(p.id))!
    const swapped = swapPlayers(lineup, outsider.id, first.playerId)
    expect(swapped.starters[0].playerId).toBe(outsider.id)
    expect([...swapped.starters.map((s) => s.playerId), ...swapped.bench]).not.toContain(
      first.playerId,
    )
  })
})

describe('repairLineup', () => {
  const lineup = autoLineup(squad, '4-3-3', 'ofensiva')

  it('leaves a playable lineup alone', () => {
    expect(repairLineup(lineup, squad)).toEqual(lineup)
  })

  it('fills the slot of an unavailable starter and keeps the tactics', () => {
    const striker = lineup.starters.find((s) => s.position === 'A')!.playerId
    const keeper = lineup.starters.find((s) => s.position === 'G')!.playerId
    const repaired = repairLineup(lineup, squad, new Set([striker, keeper]))
    expect(repaired).toMatchObject({ formation: '4-3-3', posture: 'ofensiva' })
    expect(positionsOf(repaired.starters)).toEqual(expectedShape('4-3-3'))
    const ids = [...repaired.starters.map((s) => s.playerId), ...repaired.bench]
    expect(ids).not.toContain(striker)
    expect(ids).not.toContain(keeper)
    expect(new Set(ids).size).toBe(ids.length)
    expect(repaired.bench).toHaveLength(BENCH_SIZE)
    const newKeeper = repaired.starters.find((s) => s.position === 'G')!.playerId
    expect(world.players[newKeeper].position).toBe('G')
  })

  it('drops players who left the club', () => {
    const remaining = squad.filter(
      (p) => p.id !== lineup.bench[0] && p.id !== lineup.starters[5].playerId,
    )
    const repaired = repairLineup(lineup, remaining)
    expect(repaired.starters).toHaveLength(11)
    expect(repaired.bench).toHaveLength(BENCH_SIZE)
    expect(repaired.bench).not.toContain(lineup.bench[0])
  })
})

describe('autoFormation', () => {
  it('suits the formation to the squad', () => {
    const noForwards = squad.filter((p) => p.position !== 'A')
    expect(FORMATIONS[autoFormation(noForwards)].A).toBe(1)
    const lotsOfForwards = squad.filter((p) => p.position !== 'M' || p.strength > 90)
    expect(FORMATIONS[autoFormation(lotsOfForwards)].M).toBeLessThanOrEqual(3)
  })
})
