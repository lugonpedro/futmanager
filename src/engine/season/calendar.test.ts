import { describe, expect, it } from 'vitest'
import {
  addDays,
  daysBetween,
  fifaDates,
  formatDayDate,
  inTransferWindow,
  nextWeekday,
  SATURDAY,
  seasonDates,
  weekday,
  WEDNESDAY,
} from './calendar.ts'
import { CUP_ROUNDS } from './cup.ts'

describe('dates', () => {
  it('counts days across months, leap years and years', () => {
    expect(addDays('2027-01-31', 1)).toBe('2027-02-01')
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29')
    expect(addDays('2027-12-31', 1)).toBe('2028-01-01')
    expect(addDays('2027-03-01', -1)).toBe('2027-02-28')
    expect(daysBetween('2027-01-01', '2028-01-01')).toBe(365)
  })

  it('knows the day of the week', () => {
    expect(weekday('2027-04-10')).toBe(SATURDAY)
    expect(weekday('1970-01-01')).toBe(4)
    expect(nextWeekday('2027-04-08', SATURDAY)).toBe('2027-04-10')
    expect(nextWeekday('2027-04-10', SATURDAY)).toBe('2027-04-10')
    expect(formatDayDate('2027-04-10')).toBe('sáb, 10/04/2027')
  })

  it('opens the transfer windows in January and July', () => {
    expect(inTransferWindow('2027-01-01')).toBe(true)
    expect(inTransferWindow('2027-01-31')).toBe(true)
    expect(inTransferWindow('2027-02-01')).toBe(false)
    expect(inTransferWindow('2027-07-15')).toBe(true)
    expect(inTransferWindow('2027-08-01')).toBe(false)
  })
})

describe('a season calendar', () => {
  for (const year of [2027, 2028, 2031, 2040]) {
    const { league, cup } = seasonDates(year, 38, CUP_ROUNDS)

    it(`fits 38 rounds and the cup between April and December of ${year}`, () => {
      expect(league).toHaveLength(38)
      expect(cup).toHaveLength(CUP_ROUNDS.length)
      expect(league[0] >= `${year}-04-01` && league[0] <= `${year}-04-30`).toBe(true)
      expect(weekday(league[0])).toBe(SATURDAY)
      expect(weekday(league.at(-1)!)).toBe(SATURDAY)
      expect(league.at(-1)! <= `${year}-12-10`).toBe(true)
      for (let i = 1; i < league.length; i++) {
        expect(daysBetween(league[i - 1], league[i])).toBeGreaterThanOrEqual(3)
      }
      for (const day of league) expect([SATURDAY, WEDNESDAY]).toContain(weekday(day))
      for (const day of fifaDates(year)) expect(league).not.toContain(day)
    })

    it(`plays the cup on the Wednesday after its rounds in ${year}`, () => {
      CUP_ROUNDS.forEach((round, i) => {
        expect(weekday(cup[i])).toBe(WEDNESDAY)
        expect(cup[i]).toBe(addDays(league[round - 1], 4))
        expect(league).not.toContain(cup[i])
        expect(league[round] > cup[i]).toBe(true)
      })
    })
  }
})
