import { describe, expect, it } from 'vitest'
import { passStatus } from './pass.ts'

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
