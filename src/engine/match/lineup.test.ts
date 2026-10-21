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
  formationLines,
  dropUnknownDuties,
  repairLineup,
  setDuty,
  swapPlayers,
  withRoles,
} from './lineup.ts'
import { dutiesFor, DUTIES_BY_POSITION, FORMATION_LINES, roleOf } from './roles.ts'
import { dutyFactor, roleOverall, sectorStrength } from './strength.ts'

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
    const keepers = squad.filter((p) => p.position === 'G').sort((a, b) => b.overall - a.overall)
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
    expect(swapped.starters[0]).toEqual({ ...first, playerId: second.playerId })
    expect(swapped.starters[1]).toEqual({ ...second, playerId: first.playerId })
  })

  it('sends a starter to the bench in place of a sub', () => {
    const sub = lineup.bench[2]
    const swapped = swapPlayers(lineup, first.playerId, sub)
    expect(swapped.starters[0]).toEqual({ ...first, playerId: sub })
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
  const lineup = autoLineup(squad, '4-3-3')

  it('leaves a playable lineup alone', () => {
    expect(repairLineup(lineup, squad)).toEqual(lineup)
  })

  it('puts a lineup saved with another posture back to the normal one', () => {
    const attacking = autoLineup(squad, '4-3-3', 'ofensiva')
    expect(repairLineup(attacking, squad)).toEqual({ ...attacking, posture: 'normal' })
  })

  it('fills the slot of an unavailable starter and keeps the tactics', () => {
    const striker = lineup.starters.find((s) => s.position === 'A')!.playerId
    const keeper = lineup.starters.find((s) => s.position === 'G')!.playerId
    const repaired = repairLineup(lineup, squad, new Set([striker, keeper]))
    expect(repaired).toMatchObject({ formation: '4-3-3', posture: 'normal' })
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
    const noForwards = squad.filter((p) => p.position !== 'A').map((p) => ({ ...p, secondary: [] }))
    expect(FORMATIONS[autoFormation(noForwards)].A).toBe(1)
    const lotsOfForwards = squad.filter((p) => p.position !== 'M' || p.overall > 90)
    expect(FORMATIONS[autoFormation(lotsOfForwards)].M).toBeLessThanOrEqual(3)
  })
})

describe('formationLines', () => {
  const xi = (formation: Formation) => {
    const seen: Record<string, number> = {}
    return FORMATION_LINES[formation].flat().map(({ position, role }) => {
      seen[role] = (seen[role] ?? 0) + 1
      return { position, role, id: `${role}${seen[role]}` }
    })
  }
  const ids = (lines: { id: string }[][]) => lines.map((line) => line.map((s) => s.id))

  it('lays the XI out by the lines of the formation, from the keeper forwards', () => {
    expect(ids(formationLines(xi('4-4-2').reverse(), '4-4-2'))).toEqual([
      ['GOL1'],
      ['LAT2', 'ZAG2', 'ZAG1', 'LAT1'],
      ['ME1', 'MC2', 'MC1', 'MD1'],
      ['CA2', 'CA1'],
    ])
    expect(ids(formationLines(xi('4-2-3-1'), '4-2-3-1')).slice(2)).toEqual([
      ['VOL1', 'VOL2'],
      ['ME1', 'MEI1', 'MD1'],
      ['CA1'],
    ])
  })

  it('places players without a role by their position', () => {
    const plain = xi('4-1-4-1').map(({ position, id }) => ({ position, id }))
    expect(ids(formationLines(plain, '4-1-4-1')).slice(2, 4)).toEqual([
      ['VOL1'],
      ['ME1', 'MC1', 'MC2', 'MD1'],
    ])
  })

  it('keeps everyone when a midfielder is missing or a keeper is extra', () => {
    const short = xi('4-2-3-1').filter((s) => s.id !== 'MD1')
    expect(formationLines(short, '4-2-3-1').flat()).toHaveLength(10)
    const extra = [...xi('4-4-2'), { position: 'A' as const, role: 'CA' as const, id: 'X' }]
    expect(
      formationLines(extra, '4-4-2')
        .at(-1)!
        .map((s) => s.id),
    ).toContain('X')
  })
})

describe('roles', () => {
  it('counts each formation from its lines', () => {
    expect(FORMATIONS['4-2-3-1']).toEqual({ G: 1, Z: 2, L: 2, M: 5, A: 1 })
    expect(FORMATIONS['3-5-2']).toEqual({ G: 1, Z: 3, L: 0, M: 5, A: 2 })
  })

  it('makes the best tackler of the midfielders the volante', () => {
    const lineup = autoLineup(squad, '4-1-4-1')
    const midfield = lineup.starters.filter((s) => s.position === 'M')
    const volante = midfield.find((s) => s.role === 'VOL')!
    const tackling = (id: string) => roleOverall(world.players[id], 'VOL')
    for (const other of midfield) {
      expect(tackling(volante.playerId)).toBeGreaterThanOrEqual(tackling(other.playerId))
    }
  })

  it('gives a lineup saved before roles the roles of its formation, in order', () => {
    const lineup = autoLineup(squad, '4-2-3-1')
    const plain = {
      ...lineup,
      starters: lineup.starters.map(({ playerId, position }) => ({ playerId, position })),
    }
    const roles = withRoles(plain)
      .starters.filter((s) => s.position === 'M')
      .map((s) => s.role)
    expect(roles).toEqual(['VOL', 'VOL', 'ME', 'MEI', 'MD'])
    expect(withRoles(lineup)).toBe(lineup)
  })

  it('keeps the roles when a lineup is repaired', () => {
    const lineup = autoLineup(squad, '4-2-3-1')
    const volante = lineup.starters.find((s) => s.role === 'VOL')!
    const remaining = squad.filter((p) => p.id !== volante.playerId)
    const repaired = repairLineup(lineup, remaining)
    expect(repaired.starters.filter((s) => s.role === 'VOL')).toHaveLength(2)
    expect(repaired.starters.filter((s) => s.role === 'MEI')).toHaveLength(1)
  })
})

describe('picked roles', () => {
  const lineup = autoLineup(squad, '4-3-3')
  const forward = lineup.starters.find((s) => s.role === 'CA')!

  it("play the picked role in the slot, and drop it when the pick is the slot's own", () => {
    const picked = setDuty(lineup, forward.playerId, 'F9')
    const slot = picked.starters.find((s) => s.playerId === forward.playerId)!
    expect(slot.role).toBe('CA')
    expect(roleOf(slot)).toBe('F9')
    const back = setDuty(picked, forward.playerId, 'CA')
    expect(back.starters.find((s) => s.playerId === forward.playerId)).not.toHaveProperty('duty')
  })

  it('stay with the slot when players swap', () => {
    const picked = setDuty(lineup, forward.playerId, 'AS')
    const other = picked.starters.find((s) => s.role === 'PE')!
    const swapped = swapPlayers(picked, forward.playerId, other.playerId)
    expect(swapped.starters.find((s) => s.role === 'CA')).toMatchObject({
      playerId: other.playerId,
      duty: 'AS',
    })
  })

  it('survive a repair of the lineup', () => {
    const picked = setDuty(lineup, forward.playerId, 'F9')
    const repaired = repairLineup(picked, squad)
    expect(repaired.starters.find((s) => s.playerId === forward.playerId)?.duty).toBe('F9')
    expect(repaired.starters.map((s) => s.role).sort()).toEqual(
      lineup.starters.map((s) => s.role).sort(),
    )
  })

  it('drop roles that left the game, keeping the rest of the lineup', () => {
    const picked = setDuty(lineup, forward.playerId, 'F9')
    const old = {
      ...picked,
      starters: picked.starters.map((s) =>
        s.role === 'ZAG' ? { ...s, duty: 'XER' as unknown as typeof s.role } : s,
      ),
    }
    const cleaned = dropUnknownDuties(old)
    expect(cleaned.starters.filter((s) => s.role === 'ZAG').every((s) => !('duty' in s))).toBe(true)
    expect(cleaned.starters.find((s) => s.playerId === forward.playerId)?.duty).toBe('F9')
    expect(dropUnknownDuties(picked)).toBe(picked)
  })

  it('offer a slot the roles of its part of the pitch, on its own wing only', () => {
    expect(dutiesFor({ position: 'A', role: 'PE' })).toContain('CPD')
    expect(dutiesFor({ position: 'A', role: 'PE' })).not.toContain('PD')
    expect(dutiesFor({ position: 'A', role: 'CA' })).not.toContain('PE')
    expect(dutiesFor({ position: 'Z', role: 'ZAG' })).toEqual(['ZAG', 'LAT', 'AO', 'LI'])
    expect(dutiesFor({ position: 'G', role: 'GOL' })).toEqual(['GOL'])
    for (const roles of Object.values(DUTIES_BY_POSITION)) {
      for (const role of roles) expect(roleOverall(squad[0], role)).toBeGreaterThan(0)
    }
  })

  it('trade one part of the pitch for another', () => {
    const sectors = (next: typeof lineup) =>
      sectorStrength(
        next.starters.map((s) => ({ ...s, player: world.players[s.playerId], energy: 100 })),
        'normal',
      )
    const before = sectors(lineup)
    const falseNine = sectors(setDuty(lineup, forward.playerId, 'F9'))
    expect(falseNine.midfield).toBeGreaterThan(before.midfield)
    expect(falseNine.attack).toBeLessThan(before.attack)
  })

  it('make a corta pra dentro better on the wing of his weaker foot', () => {
    const player = { ...world.players[forward.playerId], foot: 'esquerdo' as const }
    expect(dutyFactor(player, { role: 'PD', duty: 'CPD' })).toBeGreaterThan(1)
    expect(dutyFactor(player, { role: 'PE', duty: 'CPD' })).toBeLessThan(1)
    expect(dutyFactor(player, { role: 'PE' })).toBe(1)
  })
})
