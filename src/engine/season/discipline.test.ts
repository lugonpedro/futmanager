import { describe, expect, it } from 'vitest'
import type { MatchEvent, MatchResult } from '../model/types.ts'
import { createRng } from '../rng.ts'
import { addDays } from './calendar.ts'
import {
  applyDiscipline,
  INJURY_DAYS,
  YELLOWS_FOR_SUSPENSION,
  type Discipline,
} from './discipline.ts'

const today = '2026-04-04'
const none: Discipline = { injuries: {}, suspensions: {}, yellowCards: {} }

const yellow = (playerId: string): MatchEvent => ({
  minute: 10,
  type: 'amarelo',
  playerId,
  text: '',
})

/** Just what discipline reads from a result. */
const result = (parts: Partial<MatchResult>) =>
  ({ events: [], sentOff: [], injured: [], ...parts }) as unknown as MatchResult

describe('applyDiscipline', () => {
  it('bans a player sent off for the next match, and counts the ban down', () => {
    const after = applyDiscipline(none, [result({ sentOff: ['a'] })], today, createRng(1))
    expect(after.suspensions).toEqual({ a: 1 })
    const served = applyDiscipline(after, [result({})], today, createRng(1))
    expect(served.suspensions).toEqual({})
  })

  it('turns the third yellow into a ban and starts the count again', () => {
    const two = { ...none, yellowCards: { a: YELLOWS_FOR_SUSPENSION - 1 } }
    const after = applyDiscipline(
      two,
      [result({ events: [yellow('a'), yellow('b')] })],
      today,
      createRng(1),
    )
    expect(after.suspensions).toEqual({ a: 1 })
    expect(after.yellowCards).toEqual({ b: 1 })
  })

  it('does not count the yellow of a player sent off', () => {
    const after = applyDiscipline(
      none,
      [result({ events: [yellow('a')], sentOff: ['a'] })],
      today,
      createRng(1),
    )
    expect(after.yellowCards).toEqual({})
    expect(after.suspensions).toEqual({ a: 1 })
  })

  it('keeps the injured out for a week to over a month, or less with a cap', () => {
    const injured = [result({ injured: ['a', 'b', 'c'] })]
    const after = applyDiscipline(none, injured, today, createRng(7))
    for (const back of Object.values(after.injuries)) {
      expect(back >= addDays(today, INJURY_DAYS.min)).toBe(true)
      expect(back <= addDays(today, INJURY_DAYS.min + INJURY_DAYS.spread)).toBe(true)
    }
    const short = applyDiscipline(none, injured, today, createRng(7), 14)
    for (const back of Object.values(short.injuries)) expect(back <= addDays(today, 14)).toBe(true)
    expect(applyDiscipline(none, injured, today, createRng(7), 0).injuries).toEqual({})
  })

  it('leaves the record it got untouched', () => {
    const current = { injuries: {}, suspensions: { a: 2 }, yellowCards: { b: 1 } }
    applyDiscipline(
      current,
      [result({ events: [yellow('b')], sentOff: ['c'] })],
      today,
      createRng(1),
    )
    expect(current).toEqual({ injuries: {}, suspensions: { a: 2 }, yellowCards: { b: 1 } })
  })
})
