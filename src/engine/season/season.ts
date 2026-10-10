import { generateWorld } from '../generate/world.ts'
import { autoFormation, autoLineup, repairLineup } from '../match/lineup.ts'
import { createMatch, simulateMatch, type MatchInput, type MatchState } from '../match/simulate.ts'
import type {
  Fixture,
  FixtureResult,
  GameState,
  LeagueOutcome,
  Lineup,
  MatchResult,
  Season,
  SeasonSummary,
  World,
} from '../model/types.ts'
import { createRng, type Rng } from '../rng.ts'
import { createSchedule } from './schedule.ts'
import { standings, topScorers } from './standings.ts'

/** Clubs that go up from each division and down from the one above. */
export const PROMOTION_SPOTS = 4
/** Yellow cards that add up to a one-match ban. */
export const YELLOWS_FOR_SUSPENSION = 3
/** Prize for winning each division; it falls steadily to a quarter of that for last place. */
export const CHAMPION_PRIZE: Record<number, number> = { 1: 12_000_000, 2: 3_000_000 }

/** Turns any mix of numbers and labels into a 32-bit seed (FNV-1a). */
export function mixSeed(...parts: (number | string)[]): number {
  let hash = 0x811c9dc5
  for (const char of parts.join(':')) {
    hash ^= char.charCodeAt(0)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

export function startSeason(world: World, year = world.season): Season {
  const rng = createRng(mixSeed(world.seed, year, 'calendario'))
  const fixtures = Object.fromEntries(
    world.leagues.map((league) => [league.id, createSchedule(league.id, league.clubIds, rng)]),
  )
  return {
    year,
    round: 1,
    totalRounds: Math.max(...Object.values(fixtures).map((rounds) => rounds.length)),
    fixtures,
    injuries: {},
    suspensions: {},
    yellowCards: {},
  }
}

export function newGame(seed: number, userClubId: string): GameState {
  const world = generateWorld(seed)
  if (!world.clubs[userClubId]) throw new Error(`Unknown club ${userClubId}`)
  return { world, userClubId, season: startSeason(world), history: [] }
}

/** The league a club plays in this season. */
export function leagueOf(world: World, clubId: string): string {
  const league = world.leagues.find((l) => l.clubIds.includes(clubId))
  if (!league) throw new Error(`Club ${clubId} is in no league`)
  return league.id
}

export const isSeasonOver = (season: Season) => season.round > season.totalRounds

/** Fixtures of the round about to be played, across every league. */
export function roundFixtures(season: Season, round = season.round): Fixture[] {
  return Object.values(season.fixtures).flatMap((rounds) => rounds[round - 1] ?? [])
}

/** The user's club fixture in a round, if it plays. */
export function userFixture(game: GameState, round = game.season.round): Fixture | undefined {
  return roundFixtures(game.season, round).find(
    (f) => f.homeId === game.userClubId || f.awayId === game.userClubId,
  )
}

export function unavailablePlayers(season: Season): Set<string> {
  return new Set([...Object.keys(season.injuries), ...Object.keys(season.suspensions)])
}

/**
 * The lineup a club takes into its next match. The user's saved one is patched
 * up for injuries and bans; AI clubs pick their best formation and XI.
 */
export function clubLineup(game: GameState, clubId: string): Lineup {
  const { world } = game
  const squad = world.clubs[clubId].playerIds.map((id) => world.players[id])
  const out = unavailablePlayers(game.season)
  if (clubId === game.userClubId && game.userLineup) {
    return repairLineup(game.userLineup, squad, out)
  }
  return autoLineup(squad, autoFormation(squad, out), 'normal', out)
}

export function matchInput(game: GameState, fixture: Fixture): MatchInput {
  const { world } = game
  return {
    home: { club: world.clubs[fixture.homeId], lineup: clubLineup(game, fixture.homeId) },
    away: { club: world.clubs[fixture.awayId], lineup: clubLineup(game, fixture.awayId) },
    players: world.players,
  }
}

/** Each fixture has its own seed, so watching a match live or skipping it gives the same result. */
export const matchRng = (game: GameState, fixture: Fixture): Rng =>
  createRng(mixSeed(game.world.seed, game.season.year, fixture.id))

export type LiveMatch = { fixture: Fixture; state: MatchState }

/** Every match of the current round, ready to be played minute by minute. */
export function createRoundMatches(game: GameState): LiveMatch[] {
  return roundFixtures(game.season).map((fixture) => ({
    fixture,
    state: createMatch(matchInput(game, fixture), matchRng(game, fixture)),
  }))
}

export function toFixtureResult(result: MatchResult): FixtureResult {
  return {
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
    goals: result.events
      .filter((e) => e.type === 'gol' && e.playerId && e.clubId)
      .map((e) => ({ playerId: e.playerId!, clubId: e.clubId!, minute: e.minute })),
    cards: {
      home: { yellow: result.stats.home.yellowCards, red: result.stats.home.redCards },
      away: { yellow: result.stats.away.yellowCards, red: result.stats.away.redCards },
    },
  }
}

/** Counts down every ban and injury by one round, dropping the ones that are over. */
function countDown(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record)
      .map(([id, rounds]) => [id, rounds - 1] as const)
      .filter(([, rounds]) => rounds > 0),
  )
}

/**
 * Records the results of the current round and moves on to the next. Red cards
 * ban a player for the next match, three yellows too, and injuries keep a
 * player out for one to five rounds, short ones far more often.
 */
export function applyRound(game: GameState, results: readonly MatchResult[]): GameState {
  const { season } = game
  if (isSeasonOver(season)) throw new Error('The season is over')
  const byClubs = new Map(results.map((r) => [`${r.homeId}>${r.awayId}`, r]))
  const index = season.round - 1

  const fixtures = Object.fromEntries(
    Object.entries(season.fixtures).map(([leagueId, rounds]) => {
      const updated = [...rounds]
      updated[index] = rounds[index].map((fixture) => {
        const result = byClubs.get(`${fixture.homeId}>${fixture.awayId}`)
        if (!result) throw new Error(`No result for ${fixture.id}`)
        return { ...fixture, result: toFixtureResult(result) }
      })
      return [leagueId, updated]
    }),
  )

  const injuries = countDown(season.injuries)
  const suspensions = countDown(season.suspensions)
  const yellowCards = { ...season.yellowCards }
  const rng = createRng(mixSeed(game.world.seed, season.year, season.round, 'lesoes'))

  for (const result of results) {
    for (const id of result.injured) injuries[id] = 1 + Math.floor(rng.next() ** 2 * 5)
    const sentOff = new Set(result.sentOff)
    for (const id of sentOff) suspensions[id] = (suspensions[id] ?? 0) + 1
    for (const event of result.events) {
      // A yellow that leads to a sending off is already punished by the ban.
      if (event.type !== 'amarelo' || !event.playerId || sentOff.has(event.playerId)) continue
      const count = (yellowCards[event.playerId] ?? 0) + 1
      if (count >= YELLOWS_FOR_SUSPENSION) {
        suspensions[event.playerId] = (suspensions[event.playerId] ?? 0) + 1
        delete yellowCards[event.playerId]
      } else {
        yellowCards[event.playerId] = count
      }
    }
  }

  return {
    ...game,
    season: { ...season, round: season.round + 1, fixtures, injuries, suspensions, yellowCards },
  }
}

/** Plays the whole current round at once. */
export function playRound(game: GameState): GameState {
  const results = roundFixtures(game.season).map((fixture) =>
    simulateMatch(matchInput(game, fixture), matchRng(game, fixture)),
  )
  return applyRound(game, results)
}

export function leagueStandings(game: GameState, leagueId: string) {
  const league = game.world.leagues.find((l) => l.id === leagueId)
  if (!league) throw new Error(`Unknown league ${leagueId}`)
  return standings(league.clubIds, game.season.fixtures[leagueId].flat())
}

export function leagueScorers(game: GameState, leagueId: string) {
  return topScorers(game.season.fixtures[leagueId].flat())
}

export function prizeMoney(division: number, position: number, clubs: number): number {
  const top = CHAMPION_PRIZE[division] ?? CHAMPION_PRIZE[1] / 4 ** (division - 1)
  const share = 0.25 + (0.75 * (clubs - position)) / (clubs - 1)
  return Math.round((top * share) / 10_000) * 10_000
}

/** Final tables, who goes up and down, and the prize money. Works mid-season as a projection. */
export function seasonSummary(game: GameState): SeasonSummary {
  const leagues = [...game.world.leagues].sort((a, b) => a.division - b.division)
  const tables = leagues.map((league) => leagueStandings(game, league.id).map((r) => r.clubId))
  const prizes: Record<string, number> = {}

  const outcomes: LeagueOutcome[] = leagues.map((league, i) => {
    const table = tables[i]
    table.forEach((clubId, position) => {
      prizes[clubId] = prizeMoney(league.division, position + 1, table.length)
    })
    const [scorer] = leagueScorers(game, league.id)
    return {
      leagueId: league.id,
      division: league.division,
      table,
      promoted: i > 0 ? table.slice(0, PROMOTION_SPOTS) : [],
      relegated: i < leagues.length - 1 ? table.slice(-PROMOTION_SPOTS) : [],
      ...(scorer && { topScorer: scorer }),
    }
  })
  return { year: game.season.year, leagues: outcomes, prizes }
}

/** Closes a finished season: pays prizes, swaps promoted and relegated clubs, and draws the next calendar. */
export function startNextSeason(game: GameState): GameState {
  if (!isSeasonOver(game.season)) throw new Error('The season is not over yet')
  const summary = seasonSummary(game)
  const { world } = game

  const clubIdsByDivision = new Map<number, string[]>()
  summary.leagues.forEach((outcome, i) => {
    const above = summary.leagues[i - 1]
    const below = summary.leagues[i + 1]
    const leaving = new Set([...outcome.promoted, ...outcome.relegated])
    clubIdsByDivision.set(outcome.division, [
      ...outcome.table.filter((id) => !leaving.has(id)),
      ...(above?.relegated ?? []),
      ...(below?.promoted ?? []),
    ])
  })

  const clubs = { ...world.clubs }
  const leagues = world.leagues.map((league) => {
    const clubIds = clubIdsByDivision.get(league.division) ?? league.clubIds
    for (const id of clubIds) {
      clubs[id] = {
        ...clubs[id],
        division: league.division,
        cash: clubs[id].cash + (summary.prizes[id] ?? 0),
      }
    }
    return { ...league, clubIds }
  })

  const nextWorld: World = { ...world, season: game.season.year + 1, clubs, leagues }
  return {
    ...game,
    world: nextWorld,
    season: startSeason(nextWorld),
    history: [...game.history, summary],
  }
}
