import { describe, expect, it } from 'vitest'
import { passHistory, passStatus } from './pass.ts'

const now = new Date('2026-11-10T12:00:00Z')
const period = (start: string, end: string) => ({ starts_at: start, ends_at: end })

describe('passStatus', () => {
  it('has no end without a running period', () => {
    expect(passStatus([], now)).toEqual({})
    expect(passStatus([period('2026-11-11T00:00:00Z', '2026-12-11T00:00:00Z')], now)).toEqual({})
  })

  it('ends with the running period', () => {
    const rows = [period('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z')]
    expect(passStatus(rows, now).endsAt).toEqual(new Date('2026-12-01T00:00:00Z'))
  })

  it('chains the days bought while a pass runs', () => {
    const rows = [
      period('2026-12-01T00:00:00Z', '2026-12-31T00:00:00Z'),
      period('2026-11-01T00:00:00Z', '2026-12-01T00:00:00Z'),
    ]
    expect(passStatus(rows, now).endsAt).toEqual(new Date('2026-12-31T00:00:00Z'))
  })
})

describe('passHistory', () => {
  const row = (start: string, end: string, id = start) => ({
    provider: 'mercadopago',
    payment_id: id,
    amount_cents: 500,
    starts_at: start,
    ends_at: end,
  })

  it('has nothing running without a current period', () => {
    const history = passHistory([row('2026-09-01T00:00:00Z', '2026-10-01T00:00:00Z')], now)
    expect(history.lifetime).toBe(false)
    expect(history.endsAt).toBeUndefined()
    expect(history.since).toBeUndefined()
    expect(history.payments.map((p) => p.state)).toEqual(['over'])
  })

  it('counts the days left and when the chained pass began', () => {
    const history = passHistory(
      [
        row('2026-10-15T00:00:00Z', '2026-11-14T00:00:00Z'),
        row('2026-11-14T00:00:00Z', '2026-12-14T00:00:00Z'),
        row('2026-08-01T00:00:00Z', '2026-08-31T00:00:00Z'),
      ],
      now,
    )
    expect(history.since).toEqual(new Date('2026-10-15T00:00:00Z'))
    expect(history.endsAt).toEqual(new Date('2026-12-14T00:00:00Z'))
    expect(history.daysLeft).toBe(34)
    expect(history.payments.map((p) => p.state)).toEqual(['next', 'running', 'over'])
  })

  it('reads a lifetime pass', () => {
    const history = passHistory([row('2026-11-01T00:00:00Z', 'infinity')], now)
    expect(history.lifetime).toBe(true)
    expect(history.endsAt).toBeUndefined()
    expect(history.daysLeft).toBeUndefined()
    expect(history.payments[0].state).toBe('running')
    expect(history.payments[0].endsAt).toBeUndefined()
  })
})
