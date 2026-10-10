import { describe, expect, it } from 'vitest'
import { generateWorld } from '../generate/world.ts'
import type { Formation, Position } from '../model/types.ts'
import { autoLineup, BENCH_SIZE, FORMATIONS } from './lineup.ts'

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
