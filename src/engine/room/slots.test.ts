import { describe, expect, it } from 'vitest'
import { FORMATION_LINES } from '../match/roles.ts'
import type { Formation } from '../model/types.ts'
import migration from '../../../supabase/migrations/20261104000000_fut_draft.sql?raw'
import { DRAFT_FORMATIONS, RESERVE_POSITIONS, teamSlots } from './slots.ts'

describe('teamSlots', () => {
  it('lists the eleven from the keeper forwards, then the reserves', () => {
    expect(teamSlots('4-4-2', 16)).toEqual([
      ...['G', 'L', 'Z', 'Z', 'L', 'M', 'M', 'M', 'M', 'A', 'A'],
      ...['G', 'Z', 'L', 'M', 'A'],
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
    expect(migration).toContain(`array[${RESERVE_POSITIONS.map((p) => `'${p}'`).join(', ')}]`)
  })
})
