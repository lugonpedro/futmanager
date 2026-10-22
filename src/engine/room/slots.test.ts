import { describe, expect, it } from 'vitest'
import { FORMATION_LINES } from '../match/roles.ts'
import type { Formation } from '../model/types.ts'
import migration from '../../../supabase/migrations/20261104000000_fut_draft.sql?raw'
import reserves from '../../../supabase/migrations/20261114000000_reservas_por_setor.sql?raw'
import { DRAFT_FORMATIONS, placeTakes, RESERVE_PLACES, teamSlots } from './slots.ts'

describe('teamSlots', () => {
  it('lists the eleven from the keeper forwards, then the reserves', () => {
    expect(teamSlots('4-4-2', 16)).toEqual([
      ...['G', 'L', 'Z', 'Z', 'L', 'M', 'M', 'M', 'M', 'A', 'A'],
      ...['G', 'D', 'M', 'A', 'D'],
    ])
    expect(teamSlots('4-3-3', 20)).toHaveLength(20)
  })

  it('always has two keepers', () => {
    for (const formation of DRAFT_FORMATIONS)
      for (const size of [16, 18, 20])
        expect(teamSlots(formation, size).filter((p) => p === 'G')).toHaveLength(2)
  })

  it('matches the places the database keeps', () => {
    for (const formation of Object.keys(FORMATION_LINES) as Formation[]) {
      const eleven = teamSlots(formation, 11)
        .map((p) => `'${p}'`)
        .join(', ')
      expect(migration).toContain(`('${formation}', array[${eleven}])`)
    }
    expect(reserves).toContain(`array[${RESERVE_PLACES.map((p) => `'${p}'`).join(', ')}]`)
  })

  it("fills a defender's place with a centre-back or a full-back", () => {
    expect(placeTakes('D', 'Z')).toBe(true)
    expect(placeTakes('D', 'L')).toBe(true)
    expect(placeTakes('D', 'M')).toBe(false)
    expect(placeTakes('Z', 'L')).toBe(false)
    expect(placeTakes('M', 'M')).toBe(true)
  })
})
