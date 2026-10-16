import { describe, expect, it } from 'vitest'
import { dueMarketWarning, dueRoundNotice, marketNotice, roundNotice } from './notices.ts'

// Round 4 played at midnight UTC (21h in Brasília); its market closes at 23h30 UTC.
const season = {
  id: 1,
  status: 'em_andamento',
  played: 4,
  rounds: 38,
  lastPlayedAt: new Date('2026-10-17T00:00:05Z'),
}

describe('dueMarketWarning', () => {
  it('warns in the two hours before the market closes', () => {
    expect(dueMarketWarning(season, new Date('2026-10-17T22:30:00Z'))).toEqual({
      round: 5,
      closesAt: new Date('2026-10-17T23:30:00Z'),
    })
    expect(dueMarketWarning(season, new Date('2026-10-17T20:00:00Z'))).toBeUndefined()
    expect(dueMarketWarning(season, new Date('2026-10-17T23:30:00Z'))).toBeUndefined()
  })

  it('stays quiet once the season is over', () => {
    const now = new Date('2026-10-17T22:30:00Z')
    expect(dueMarketWarning({ ...season, status: 'encerrada' }, now)).toBeUndefined()
    expect(dueMarketWarning({ ...season, played: 38 }, now)).toBeUndefined()
  })
})

describe('dueRoundNotice', () => {
  it('tells of a round played in the last hours only', () => {
    expect(dueRoundNotice(season, new Date('2026-10-17T00:15:00Z'))).toEqual({ round: 4 })
    expect(dueRoundNotice(season, new Date('2026-10-17T04:00:00Z'))).toBeUndefined()
    expect(
      dueRoundNotice({ ...season, played: 0 }, new Date('2026-10-17T00:15:00Z')),
    ).toBeUndefined()
  })
})

describe('notice texts', () => {
  it('gives the closing time in Brasília', () => {
    expect(marketNotice(5, new Date('2026-10-17T23:30:00Z'))).toEqual({
      title: 'O mercado vai fechar',
      body: 'O mercado da rodada 5 fecha às 20:30. Confira o seu time antes.',
      url: '/fantasia',
      tag: 'mercado-5',
    })
  })

  it('tells the points when the player had a team', () => {
    expect(roundNotice(4, 42.25).body).toBe('Seu time fez 42,3 pontos. Veja os jogos da rodada.')
    expect(roundNotice(4).body).toBe('Veja os resultados e os jogos da rodada.')
    expect(roundNotice(4).url).toBe('/fantasia/rodada/4')
  })
})
