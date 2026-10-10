import { describe, expect, it } from 'vitest'
import { allCityNames, shortNameCandidates } from './names.ts'

describe('shortNameCandidates', () => {
  it('starts with a three-letter code without accents or connectors', () => {
    expect(shortNameCandidates('Lagoa Grande')[0]).toBe('LAG')
    expect(shortNameCandidates('Vale das Pedras')[0]).toBe('VAP')
    expect(shortNameCandidates('Rio do Sul')[0]).toBe('RIS')
  })

  it('offers alternatives, all three letters long', () => {
    const candidates = shortNameCandidates('Barra das Águas')
    expect(candidates.length).toBeGreaterThan(3)
    for (const code of candidates) expect(code).toMatch(/^[A-Z]{3}$/)
  })
})

describe('allCityNames', () => {
  it('has no repeated names and enough for two divisions', () => {
    const cities = allCityNames()
    expect(new Set(cities).size).toBe(cities.length)
    expect(cities.length).toBeGreaterThanOrEqual(40)
  })
})
