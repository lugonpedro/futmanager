import { describe, expect, it } from 'vitest'
import { BUILT_IN_PACKS } from '../../packs/index.ts'
import {
  nextOfficialSeason,
  officialClubs,
  officialRounds,
  officialSeasonOver,
  playOfficialRound,
  startOfficialSeason,
  type OfficialState,
} from './official.ts'
import { startingPrice } from './prices.ts'
import { roundPoints } from './scoring.ts'
import { matchResult, playMinute, replayMatch } from '../match/simulate.ts'

const pack = await BUILT_IN_PACKS.find((p) => p.id === 'brasileirao-2026')!.load()
const opening = startOfficialSeason(7, pack)

describe('official season', () => {
  it('opens with the whole top division on the market', () => {
    const { state, round } = opening
    const clubs = officialClubs(state)
    expect(Object.keys(clubs)).toHaveLength(20)
    expect(clubs[state.game.userClubId]).toBeUndefined()
    expect(round.round).toBe(0)
    expect(round.results).toEqual([])
    const players = Object.values(round.pool)
    expect(players.length).toBeGreaterThan(400)
    for (const [id, p] of Object.entries(round.pool)) {
      expect(clubs[p.clubId]).toBeDefined()
      expect(p.price).toBe(startingPrice(state.game.world.players[id].overall))
    }
    expect(officialRounds(state)).toBe(38)
  })

  it('plays one league round, scores it and moves the prices of who played', () => {
    const { state, round } = playOfficialRound(opening.state, 11)
    expect(round.round).toBe(1)
    expect(round.results).toHaveLength(10)
    const clubs = officialClubs(state)
    for (const r of round.results) expect(clubs[r.homeId] && clubs[r.awayId]).toBeTruthy()
    expect(Object.keys(round.points).length).toBeGreaterThan(220)
    let moved = 0
    for (const [id, p] of Object.entries(round.pool)) {
      if (round.points[id] === undefined)
        expect(p.price).toBe(opening.round.pool[id]?.price ?? p.price)
      else if (p.price !== opening.round.pool[id].price) moved++
    }
    expect(moved).toBeGreaterThan(100)
  })

  it('gives the same round from a stored copy of the state', () => {
    const stored = JSON.parse(JSON.stringify(opening.state)) as OfficialState
    expect(playOfficialRound(stored, 11).round).toEqual(playOfficialRound(opening.state, 11).round)
  })

  it('replays every match of the round exactly as it went', () => {
    const { round } = playOfficialRound(opening.state, 11)
    expect(round.replays).toHaveLength(round.results.length)
    const results = round.replays.map((replay) => {
      const state = replayMatch(JSON.parse(JSON.stringify(replay)))
      while (!state.finished) playMinute(state)
      return matchResult(state)
    })
    expect(results).toEqual(round.results)
    expect(roundPoints(results)).toEqual(round.points)
  })

  it('plays a different round from a different seed', () => {
    const a = playOfficialRound(opening.state, 11).round.results
    const b = playOfficialRound(opening.state, 12).round.results
    expect(a.map((r) => r.events.length)).not.toEqual(b.map((r) => r.events.length))
  })

  it('runs to the end of the season and into the next one', { timeout: 120_000 }, () => {
    let state = opening.state
    let last = 0
    while (!officialSeasonOver(state)) {
      const played = playOfficialRound(state, last)
      expect(played.round.round).toBe(last + 1)
      last = played.round.round
      state = played.state
    }
    expect(last).toBe(38)
    expect(() => playOfficialRound(state, 1)).toThrow()
    const next = nextOfficialSeason(state, 5)
    expect(next.round.round).toBe(0)
    expect(next.state.game.season.year).toBe(state.game.season.year + 1)
    expect(playOfficialRound(next.state, 6).round.round).toBe(1)
  })
})
