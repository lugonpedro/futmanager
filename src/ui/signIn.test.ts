import { describe, expect, it } from 'vitest'
import { readReturnTo, signInLink } from './signIn.ts'

describe('signInLink', () => {
  it('carries the page to come back to', () => {
    expect(signInLink('/fantasia/convite/ABC123')).toBe(
      '/conta?volta=%2Ffantasia%2Fconvite%2FABC123',
    )
  })
})

describe('readReturnTo', () => {
  it('takes the game own pages', () => {
    expect(readReturnTo('/fantasia/passe')).toBe('/fantasia/passe')
    expect(readReturnTo('/fantasia#ligas')).toBe('/fantasia#ligas')
  })

  it('refuses other sites and odd paths', () => {
    expect(readReturnTo(null)).toBeUndefined()
    expect(readReturnTo('')).toBeUndefined()
    expect(readReturnTo('https://example.com')).toBeUndefined()
    expect(readReturnTo('//example.com')).toBeUndefined()
    expect(readReturnTo('/\\example.com')).toBeUndefined()
    expect(readReturnTo('fantasia')).toBeUndefined()
  })

  it('does not loop back to the account page', () => {
    expect(readReturnTo('/conta')).toBeUndefined()
    expect(readReturnTo('/conta/passe')).toBeUndefined()
  })
})
