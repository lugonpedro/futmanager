import { describe, expect, it } from 'vitest'
import { inviteLink, places, readInviteCode } from './fantasyLeague.ts'

describe('places', () => {
  it('shares a place between equal totals and skips the next', () => {
    expect(places([30, 20, 20, 10])).toEqual([1, 2, 2, 4])
    expect(places([5, 5, 5])).toEqual([1, 1, 1])
    expect(places([])).toEqual([])
  })
})

describe('invite codes', () => {
  it('takes the code from a link or as typed', () => {
    const link = inviteLink('https://onzemestre.com', 'GZLHZ9SU')
    expect(link).toBe('https://onzemestre.com/fantasia/convite/GZLHZ9SU')
    expect(readInviteCode(` ${link} `)).toBe('GZLHZ9SU')
    expect(readInviteCode('gzlhz9su')).toBe('GZLHZ9SU')
  })
})
