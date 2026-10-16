import { describe, expect, it } from 'vitest'
import type { LedgerEntry } from '../model/types.ts'
import { averageGate, monthlyTotals } from './finance.ts'

const entry = (date: string, category: LedgerEntry['category'], amount: number): LedgerEntry => ({
  date,
  category,
  amount,
  note: '',
})

describe('monthlyTotals', () => {
  it('adds incomes and costs per month and fills the quiet months', () => {
    const months = monthlyTotals([
      entry('2026-04-04', 'bilheteria', 100),
      entry('2026-04-30', 'salarios', -60),
      entry('2026-04-30', 'patrocinio', 40),
      entry('2026-06-10', 'compras', -25),
    ])
    expect(months).toEqual([
      { year: 2026, month: 4, income: 140, costs: 60 },
      { year: 2026, month: 5, income: 0, costs: 0 },
      { year: 2026, month: 6, income: 0, costs: 25 },
    ])
  })

  it('crosses the turn of the year', () => {
    const months = monthlyTotals([
      entry('2026-12-20', 'premiacao', 10),
      entry('2027-01-05', 'salarios', -5),
    ])
    expect(months.map((m) => [m.year, m.month])).toEqual([
      [2026, 12],
      [2027, 1],
    ])
  })

  it('is empty without entries', () => {
    expect(monthlyTotals([])).toEqual([])
  })
})

describe('averageGate', () => {
  it('averages the gate money of home games only', () => {
    expect(
      averageGate([
        entry('2026-04-04', 'bilheteria', 100),
        entry('2026-04-11', 'bilheteria', 201),
        entry('2026-04-30', 'patrocinio', 999),
      ]),
    ).toBe(151)
    expect(averageGate([])).toBeUndefined()
  })
})
