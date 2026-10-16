import { describe, expect, it } from 'vitest'
import type { Pick } from '../engine/fantasy/team.ts'
import {
  addPlayer,
  cannotAdd,
  emptyDraft,
  openSlots,
  removePlayer,
  withFormation,
} from './fantasyDraft.ts'

const pool: Record<string, Pick> = {
  g1: { position: 'G', price: 5 },
  g2: { position: 'G', price: 5 },
  a1: { position: 'A', price: 20 },
  a2: { position: 'A', price: 20 },
  a3: { position: 'A', price: 20 },
  a4: { position: 'A', price: 60 },
}

describe('fantasy draft', () => {
  it('fills the formation one place at a time', () => {
    let draft = emptyDraft('4-3-3')
    expect(cannotAdd(draft, 'g1', pool)).toBeUndefined()
    draft = addPlayer(draft, 'g1')
    expect(cannotAdd(draft, 'g1', pool)).toBe('Já está no time.')
    expect(cannotAdd(draft, 'g2', pool)).toBe('Não há vaga para essa posição.')
    draft = addPlayer(addPlayer(addPlayer(draft, 'a1'), 'a2'), 'a3')
    expect(openSlots(draft, pool)).toMatchObject({ G: 0, A: 0, M: 3 })
    expect(cannotAdd(removePlayer(draft, 'a3'), 'a4', pool)).toBe('Passa do orçamento.')
  })

  it('keeps who still fits when the formation changes', () => {
    const draft = {
      ...addPlayer(addPlayer(addPlayer(emptyDraft(), 'a1'), 'a2'), 'a3'),
      captainId: 'a3',
    }
    const narrower = withFormation(draft, '4-5-1', pool)
    expect(narrower).toEqual({ formation: '4-5-1', playerIds: ['a1'], captainId: '' })
    expect(withFormation(draft, '4-2-4', pool).captainId).toBe('a3')
    // Someone who left the top division drops out.
    expect(withFormation({ ...draft, playerIds: ['gone', 'a1'] }, '4-3-3', pool).playerIds).toEqual(
      ['a1'],
    )
  })

  it('drops the captain with the player', () => {
    const draft = { ...addPlayer(emptyDraft(), 'a1'), captainId: 'a1' }
    expect(removePlayer(draft, 'a1')).toEqual(emptyDraft())
  })
})
