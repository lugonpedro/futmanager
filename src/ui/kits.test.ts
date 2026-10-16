import { describe, expect, it } from 'vitest'
import type { Club } from '../engine/model/types.ts'
import { CLASH, colorDistance, matchKits, textOn } from './kits.ts'

const club = (primary: string, secondary: string) =>
  ({ colors: { primary, secondary } }) as unknown as Club

describe('colorDistance', () => {
  it('tells red from wine apart less than red from blue', () => {
    expect(colorDistance('#c8102e', '#7a1f2b')).toBeLessThan(CLASH)
    expect(colorDistance('#c8102e', '#003da5')).toBeGreaterThan(CLASH)
    expect(colorDistance('#123456', '#123456')).toBe(0)
  })
})

describe('matchKits', () => {
  it('lets the visitors wear their colours when they do not clash', () => {
    const kits = matchKits(club('#c8102e', '#ffffff'), club('#003da5', '#ffffff'))
    expect(kits.home.fill).toBe('#c8102e')
    expect(kits.away.fill).toBe('#003da5')
  })

  it('changes to the second colour, then to a third kit', () => {
    expect(matchKits(club('#c8102e', '#ffffff'), club('#7a1f2b', '#ffffff')).away.fill).toBe(
      '#ffffff',
    )
    const third = matchKits(club('#003da5', '#7a1f2b'), club('#5b2c83', '#003da5')).away
    expect(['#ffffff', '#111111', '#8a8f98']).toContain(third.fill)
    expect(colorDistance(third.fill, '#003da5')).toBeGreaterThan(CLASH)
  })

  it('gives the keepers shirts unlike both sides and each other', () => {
    const kits = matchKits(club('#ffd100', '#006b3f'), club('#ff7f00', '#000000'))
    expect(kits.home.keeper).not.toBe(kits.away.keeper)
    for (const keeper of [kits.home.keeper, kits.away.keeper]) {
      expect(colorDistance(keeper, kits.home.fill)).toBeGreaterThan(CLASH)
      expect(colorDistance(keeper, kits.away.fill)).toBeGreaterThan(CLASH)
    }
  })

  it('keeps the trim visible on the shirt', () => {
    const kits = matchKits(club('#c8102e', '#ffffff'), club('#ffffff', '#ffffff'))
    expect(colorDistance(kits.away.line, kits.away.fill)).toBeGreaterThanOrEqual(CLASH)
  })
})

describe('textOn', () => {
  it('writes white on dark shirts and black on light ones', () => {
    expect(textOn('#000000')).toBe('#ffffff')
    expect(textOn('#ffd100')).toBe('#111111')
  })
})
