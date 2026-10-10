import { describe, expect, it } from 'vitest'
import { generateWorld } from '../generate/world.ts'
import type { Formation, MatchResult, Posture, World } from '../model/types.ts'
import { createRng } from '../rng.ts'
import { autoLineup } from './lineup.ts'
import {
  createMatch,
  MAX_SUBSTITUTIONS,
  playMinute,
  simulateMatch,
  substitute,
} from './simulate.ts'
import { sectorStrength } from './strength.ts'

const world = generateWorld(2027)

function input(
  homeId: string,
  awayId: string,
  options: { home?: [Formation, Posture]; away?: [Formation, Posture]; from?: World } = {},
) {
  const w = options.from ?? world
  const lineup = (id: string, tactic: [Formation, Posture] = ['4-4-2', 'normal']) =>
    autoLineup(
      w.clubs[id].playerIds.map((pid) => w.players[pid]),
      ...tactic,
    )
  return {
    home: { club: w.clubs[homeId], lineup: lineup(homeId, options.home) },
    away: { club: w.clubs[awayId], lineup: lineup(awayId, options.away) },
    players: w.players,
  }
}

/** Every club in a division plays every other at home and away, over a few worlds. */
function roundRobin(division: number, seeds = [1, 2, 3]): MatchResult[] {
  const results: MatchResult[] = []
  for (const seed of seeds) {
    const w = generateWorld(seed)
    const rng = createRng(seed)
    const ids = w.leagues[division - 1].clubIds
    for (const home of ids) {
      for (const away of ids) {
        if (home !== away) results.push(simulateMatch(input(home, away, { from: w }), rng))
      }
    }
  }
  return results
}

const share = (results: MatchResult[], test: (r: MatchResult) => boolean) =>
  results.filter(test).length / results.length
const averageGoals = (results: MatchResult[]) =>
  results.reduce((sum, r) => sum + r.homeGoals + r.awayGoals, 0) / results.length

describe('simulateMatch', () => {
  const result = simulateMatch(input('C1', 'C2'), createRng(99))

  it('plays the same match for the same seed', () => {
    expect(simulateMatch(input('C1', 'C2'), createRng(99))).toEqual(result)
  })

  it('narrates kick-off, half-time and full-time in order', () => {
    const minutes = result.events.map((e) => e.minute)
    expect(minutes).toEqual([...minutes].sort((a, b) => a - b))
    expect(result.events[0].type).toBe('inicio')
    expect(result.events.filter((e) => e.type === 'intervalo')).toHaveLength(1)
    expect(result.events.at(-1)).toMatchObject({ type: 'fim', minute: 90 })
    for (const event of result.events) expect(event.text.length).toBeGreaterThan(0)
  })

  it('keeps the score, goal events and stats consistent', () => {
    const goals = (clubId: string) =>
      result.events.filter((e) => e.type === 'gol' && e.clubId === clubId).length
    expect(goals('C1')).toBe(result.homeGoals)
    expect(goals('C2')).toBe(result.awayGoals)
    expect(result.stats.home.goals).toBe(result.homeGoals)
    expect(result.stats.home.possession + result.stats.away.possession).toBe(100)
    for (const side of [result.stats.home, result.stats.away]) {
      expect(side.shotsOnTarget).toBeLessThanOrEqual(side.shots)
      expect(side.goals).toBeLessThanOrEqual(side.shotsOnTarget)
    }
  })

  it('credits goals to players on the scoring side', () => {
    const results = roundRobin(1, [4])
    for (const r of results) {
      for (const event of r.events.filter((e) => e.type === 'gol')) {
        expect(event.clubId).toBeDefined()
        expect(event.playerId).toBeDefined()
      }
    }
  })
})

describe('match balance', () => {
  const serieA = roundRobin(1)
  const serieB = roundRobin(2)

  it.each([
    ['Série A', serieA],
    ['Série B', serieB],
  ])('averages about 2.5 goals a game in %s', (_, results) => {
    expect(averageGoals(results)).toBeGreaterThan(2.2)
    expect(averageGoals(results)).toBeLessThan(2.8)
  })

  it.each([
    ['Série A', serieA],
    ['Série B', serieB],
  ])('gives the home side about 45%% of wins and leaves room for draws in %s', (_, results) => {
    const homeWins = share(results, (r) => r.homeGoals > r.awayGoals)
    const draws = share(results, (r) => r.homeGoals === r.awayGoals)
    const awayWins = share(results, (r) => r.homeGoals < r.awayGoals)
    expect(homeWins).toBeGreaterThan(0.4)
    expect(homeWins).toBeLessThan(0.5)
    expect(draws).toBeGreaterThan(0.18)
    expect(awayWins).toBeGreaterThan(0.25)
  })

  it('keeps red cards and injuries occasional', () => {
    const reds = serieA.reduce((sum, r) => sum + r.sentOff.length, 0) / serieA.length
    const injuries = serieA.reduce((sum, r) => sum + r.injured.length, 0) / serieA.length
    expect(reds).toBeGreaterThan(0.05)
    expect(reds).toBeLessThan(0.3)
    expect(injuries).toBeGreaterThan(0.05)
    expect(injuries).toBeLessThan(0.4)
  })

  it('lets the stronger side win more, without making upsets impossible', () => {
    const [best, worst] = [world.leagues[0].clubIds[0], world.leagues[0].clubIds.at(-1)!]
    const rng = createRng(5)
    const games = Array.from({ length: 500 }, (_, i) =>
      i % 2 === 0 ? simulateMatch(input(best, worst), rng) : simulateMatch(input(worst, best), rng),
    )
    const bestWins = share(games, (r) =>
      r.homeId === best ? r.homeGoals > r.awayGoals : r.awayGoals > r.homeGoals,
    )
    const worstWins = share(games, (r) =>
      r.homeId === worst ? r.homeGoals > r.awayGoals : r.awayGoals > r.homeGoals,
    )
    expect(bestWins).toBeGreaterThan(0.65)
    expect(worstWins).toBeGreaterThan(0.04)
    expect(bestWins).toBeGreaterThan(worstWins * 4)
  })

  it('makes an attacking posture produce more goals at both ends', () => {
    const play = (posture: Posture) => {
      const rng = createRng(11)
      return Array.from({ length: 1000 }, () =>
        simulateMatch(input('C5', 'C6', { home: ['4-3-3', posture] }), rng),
      )
    }
    const [defensive, attacking] = [play('defensiva'), play('ofensiva')]
    const scored = (rs: MatchResult[]) => rs.reduce((s, r) => s + r.homeGoals, 0)
    const conceded = (rs: MatchResult[]) => rs.reduce((s, r) => s + r.awayGoals, 0)
    expect(scored(attacking)).toBeGreaterThan(scored(defensive))
    expect(conceded(attacking)).toBeGreaterThan(conceded(defensive))
  })
})

describe('match state', () => {
  it('weakens a side that loses a player', () => {
    const lineup = autoLineup(world.clubs.C1.playerIds.map((id) => world.players[id]))
    const onPitch = lineup.starters.map(({ playerId, position }) => ({
      player: world.players[playerId],
      position,
      energy: 100,
    }))
    const full = sectorStrength(onPitch, 'normal')
    const short = sectorStrength(
      onPitch
        .filter((p) => p.position !== 'Z')
        .concat(onPitch.filter((p) => p.position === 'Z')[0]),
      'normal',
    )
    expect(short.defense).toBeLessThan(full.defense)
  })

  it(`allows at most ${MAX_SUBSTITUTIONS} substitutions, from the bench only`, () => {
    const match = createMatch(input('C1', 'C2'), createRng(3))
    playMinute(match)
    const starters = match.home.onPitch.filter((p) => p.position !== 'G').map((p) => p.player.id)
    const bench = match.home.bench.map((p) => p.id)
    expect(substitute(match, 'home', starters[0], 'nobody')).toBe(false)
    const made = bench.map((id, i) => substitute(match, 'home', starters[i], id))
    expect(made.filter(Boolean)).toHaveLength(MAX_SUBSTITUTIONS)
    expect(match.events.filter((e) => e.type === 'substituicao')).toHaveLength(MAX_SUBSTITUTIONS)
    expect(match.home.onPitch).toHaveLength(11)
  })
})
