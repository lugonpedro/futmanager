import { describe, expect, it } from 'vitest'
import { readReturnTo, signInLink } from './signIn.ts'

describe('signInLink', () => {
  it('carries the page to come back to', () => {
    expect(signInLink('/nuvem?slot=abc')).toBe('/conta?volta=%2Fnuvem%3Fslot%3Dabc')
  })
})

describe('readReturnTo', () => {
  it('takes the game own pages', () => {
    expect(readReturnTo('/nuvem')).toBe('/nuvem')
    expect(readReturnTo('/aprenda/carreira#mercado')).toBe('/aprenda/carreira#mercado')
  })

  it('refuses other sites and odd paths', () => {
    expect(readReturnTo(null)).toBeUndefined()
    expect(readReturnTo('')).toBeUndefined()
    expect(readReturnTo('https://example.com')).toBeUndefined()
    expect(readReturnTo('//example.com')).toBeUndefined()
    expect(readReturnTo('/\\example.com')).toBeUndefined()
    expect(readReturnTo('nuvem')).toBeUndefined()
  })

  it('does not loop back to the account page', () => {
    expect(readReturnTo('/conta')).toBeUndefined()
    expect(readReturnTo('/conta/passe')).toBeUndefined()
  })
})
