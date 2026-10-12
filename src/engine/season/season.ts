import {
  BOARD,
  confidenceAfterMatch,
  confidenceAtClose,
  findJobOffers,
  newCareer,
} from '../career/board.ts'
import { ECONOMY } from '../finance/economy.ts'
import {
  applyPayments,
  isPayday,
  ledgerTotals,
  matchdayPayments,
  mergePayments,
  monthsInSeason,
  payday,
  type Payments,
} from '../finance/finance.ts'
import { generateWorld } from '../generate/world.ts'
import { autoFormation, autoLineup, repairLineup } from '../match/lineup.ts'
import { createMatch, simulateMatch, type MatchInput, type MatchState } from '../match/simulate.ts'
import { ageWorld, youthIntake } from '../progression/progression.ts'
import type {
  CareerSeason,
  Fixture,
  GameState,
  LeagueOutcome,
  Lineup,
  MatchResult,
  Season,
  SeasonSummary,
  World,
} from '../model/types.ts'
import { createRng, mixSeed, type Rng } from '../rng.ts'
import { closeContracts, marketRound } from '../transfer/market.ts'
import {
  CUP_NAME,
  cupPrize,
  cupProgress,
  cupStageAt,
  cupWinner,
  createCup,
  playCupStage,
} from './cup.ts'
import { toFixtureResult } from './results.ts'
import { PROMOTION_SPOTS } from './rules.ts'
import { createSchedule } from './schedule.ts'
import { standings, topScorers } from './standings.ts'

export { PROMOTION_SPOTS } from './rules.ts'
export { toFixtureResult } from './results.ts'

/** Yellow cards that add up to a one-match ban. */
export const YELLOWS_FOR_SUSPENSION = 3
/** Prize for winning each division; it falls steadily to a quarter of that for last place. */
export const CHAMPION_PRIZE: Record<number, number> = { 1: 30_000_000, 2: 8_000_000 }
/** Bumped when the save format changes; see upgradeGame(). */
export const SAVE_VERSION = 3

export { mixSeed } from '../rng.ts'

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
    appearances: {},
    cup: createCup(Object.values(world.clubs), createRng(mixSeed(world.seed, year, 'copa'))),
  }
}

export function newGame(seed: number, userClubId: string): GameState {
  const world = generateWorld(seed)
  if (!world.clubs[userClubId]) throw new Error(`Unknown club ${userClubId}`)
  return {
    version: SAVE_VERSION,
    world,
    userClubId,
    season: startSeason(world),
    ledger: [],
    market: { listed: {}, offers: [], news: [] },
    career: newCareer(world, userClubId),
    history: [],
  }
}

/** The league a club plays in this season. */
export function leagueOf(world: World, clubId: string): string {
  const league = world.leagues.find((l) => l.clubIds.includes(clubId))
  if (!league) throw new Error(`Club ${clubId} is in no league`)
  return league.id
}

export const isSeasonOver = (season: Season) => season.round > season.totalRounds

/** Whether the next round can be played: the season goes on and the manager has a job. */
export const canPlayRound = (game: GameState) =>
  !isSeasonOver(game.season) && game.career.status === 'empregado'

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
  const appearances = { ...season.appearances }
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

  for (const result of results) countAppearances(game, result, appearances)

  const recorded: GameState = {
    ...game,
    season: { ...season, fixtures, injuries, suspensions, yellowCards, appearances },
  }
  const cup = playCup(recorded)
  const judged = judgeManager(cup.game, results)

  // Gate money uses the table as it stood before these results.
  const played = roundFixtures(season)
  const payments = mergePayments(
    matchdayPayments(game, played),
    isPayday(season.round)
      ? payday(game, 1, `Mês ${season.round / ECONOMY.roundsPerMonth}`)
      : mergePayments(),
    cup.payments,
  )
  const settled = marketRound(
    applyPayments(judged, payments),
    createRng(mixSeed(game.world.seed, season.year, season.round, 'mercado')),
  )
  return { ...settled, season: { ...settled.season, round: season.round + 1 } }
}

/** Counts a match for every player who started it or came on. */
function countAppearances(
  game: GameState,
  result: MatchResult,
  appearances: Record<string, number>,
) {
  const ids = [
    ...clubLineup(game, result.homeId).starters.map((s) => s.playerId),
    ...clubLineup(game, result.awayId).starters.map((s) => s.playerId),
    ...result.events.flatMap((e) =>
      e.type === 'substituicao' && e.otherPlayerId ? [e.otherPlayerId] : [],
    ),
  ]
  for (const id of ids) appearances[id] = (appearances[id] ?? 0) + 1
}

/**
 * The cup stage due after this league round, if any: every tie simulated,
 * injuries carried into the league (cards stay in the cup), prize money for
 * each winner.
 */
function playCup(game: GameState): { game: GameState; payments: Payments } {
  const { season, world } = game
  const stage = cupStageAt(season.cup, season.round)
  if (stage < 0 || !season.cup) return { game, payments: mergePayments() }
  const rng = createRng(mixSeed(world.seed, season.year, 'copa', stage))
  const played = playCupStage(
    season.cup,
    stage,
    (tie) => simulateMatch(matchInput(game, tie), matchRng(game, tie)),
    rng,
  )
  const injuries = { ...season.injuries }
  const appearances = { ...season.appearances }
  for (const result of played.results) {
    countAppearances(game, result, appearances)
    for (const id of result.injured) {
      injuries[id] = Math.max(injuries[id] ?? 0, 1 + Math.floor(rng.next() ** 2 * 5))
    }
  }
  const prize = cupPrize(season.cup, stage)
  const payments: Payments = { cash: {}, entries: [] }
  for (const id of played.winners) payments.cash[id] = prize
  if (played.winners.includes(game.userClubId)) {
    payments.entries.push({
      round: season.round,
      category: 'premiacao',
      amount: prize,
      note: `${CUP_NAME}, ${season.cup.stages[stage].name.toLowerCase()}`,
    })
  }
  return {
    game: { ...game, season: { ...season, cup: played.cup, injuries, appearances } },
    payments,
  }
}

/** The board reacts to the user's league result, and sacks the manager when it runs out of patience. */
function judgeManager(game: GameState, results: readonly MatchResult[]): GameState {
  const { career, world, userClubId, season } = game
  if (career.status !== 'empregado') return game
  const match = results.find((r) => r.homeId === userClubId || r.awayId === userClubId)
  if (!match) return game
  const home = match.homeId === userClubId
  const position = userPosition(game)
  const confidence = confidenceAfterMatch(
    career,
    home ? match.homeGoals : match.awayGoals,
    home ? match.awayGoals : match.homeGoals,
    position,
    season.round,
  )
  if (confidence > 0) return { ...game, career: { ...career, confidence } }
  const rng = createRng(mixSeed(world.seed, season.year, season.round, 'diretoria'))
  return {
    ...game,
    career: {
      ...career,
      confidence,
      status: 'demitido',
      jobOffers: findJobOffers(game, 'demitido', rng),
      history: [...career.history, { ...careerSeason(game, position), fired: true }],
    },
  }
}

function userPosition(game: GameState): number {
  const table = leagueStandings(game, leagueOf(game.world, game.userClubId))
  return table.findIndex((row) => row.clubId === game.userClubId) + 1
}

function careerSeason(game: GameState, position: number): CareerSeason {
  const { world, userClubId, season, career } = game
  const cup = cupProgress(season.cup, userClubId)
  return {
    year: season.year,
    clubId: userClubId,
    division: world.clubs[userClubId].division,
    position,
    target: career.target,
    ...(cup && { cup }),
  }
}

/** How the board sees the season that just ended, and who wants the manager next. */
export type SeasonReview = {
  position: number
  target: number
  confidence: number
  fired: boolean
  offers: string[]
}

export function seasonReview(game: GameState): SeasonReview {
  const { career, world, season } = game
  const position = userPosition(game)
  if (career.status === 'demitido') {
    return { position, target: career.target, confidence: 0, fired: true, offers: career.jobOffers }
  }
  const confidence = confidenceAtClose(career, position)
  const fired = confidence <= 0
  const rng = createRng(mixSeed(world.seed, season.year, 'diretoria'))
  const offers = fired
    ? findJobOffers(game, 'demitido', rng)
    : confidence >= BOARD.goodSeason
      ? findJobOffers(game, 'sucesso', rng)
      : []
  return { position, target: career.target, confidence, fired, offers }
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

/**
 * Closes a finished season: pays prizes, ages the players and brings up the
 * youngsters, settles contracts, swaps promoted and relegated clubs and draws
 * the next calendar. The manager stays put unless he takes one of the offers
 * from seasonReview(), which he must when sacked.
 */
export function startNextSeason(game: GameState, nextClubId = game.userClubId): GameState {
  if (!isSeasonOver(game.season)) throw new Error('The season is not over yet')
  const review = seasonReview(game)
  const moving = nextClubId !== game.userClubId
  if (!moving && review.fired) throw new Error('O técnico foi demitido: escolha um novo clube.')
  if (moving && !review.offers.includes(nextClubId)) throw new Error('Esse clube não fez proposta.')
  const nextYear = game.season.year + 1
  const prizes = seasonSummary(game).prizes
  // The months the calendar's paydays didn't reach, then prizes, then contracts running out.
  const closing = mergePayments(
    payday(
      game,
      ECONOMY.monthsPerYear - monthsInSeason(game.season.totalRounds),
      'Meses fora da temporada',
    ),
    {
      cash: {},
      entries: [
        {
          round: game.season.round,
          category: 'premiacao',
          amount: prizes[game.userClubId] ?? 0,
          note: `Premiação da temporada ${game.season.year}`,
        },
      ],
    },
  )
  const seed = (label: string) => createRng(mixSeed(game.world.seed, game.season.year, label))
  const settled = applyPayments(game, closing)
  const aged = ageWorld(settled.world, game.season.appearances, seed('idade'))
  const listed = Object.fromEntries(
    Object.entries(settled.market.listed).filter(
      ([id]) => aged.world.players[id]?.clubId === game.userClubId,
    ),
  )
  const youth = youthIntake(
    { ...settled, world: aged.world, market: { ...settled.market, listed } },
    nextYear,
    seed('base'),
  )
  const paid = closeContracts(youth.game, nextYear, seed('contratos'))
  const cupWinnerId = cupWinner(game.season.cup)
  const summary: SeasonSummary = {
    ...seasonSummary(paid),
    userFinances: ledgerTotals(paid.ledger),
    ...(cupWinnerId && { cupWinnerId }),
    userRetired: aged.retired
      .filter((p) => game.world.players[p.id].clubId === game.userClubId)
      .map((p) => p.id),
    userYouth: youth.userYouth.map((p) => p.id),
  }
  const { world } = paid

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

  const nextWorld: World = { ...world, season: nextYear, clubs, leagues }
  // A manager sacked mid-season already has that season on his record.
  const careerHistory =
    game.career.status === 'demitido'
      ? game.career.history
      : [...game.career.history, careerSeason(game, review.position)]
  const career = newCareer(nextWorld, nextClubId, careerHistory)
  return {
    ...paid,
    world: nextWorld,
    season: startSeason(nextWorld),
    ledger: [],
    history: [...game.history, summary],
    ...(moving && {
      userClubId: nextClubId,
      userLineup: undefined,
      market: { ...paid.market, listed: {}, offers: [] },
    }),
    career: moving
      ? career
      : {
          ...career,
          confidence: Math.min(
            BOARD.newSeasonCeiling,
            Math.max(BOARD.newSeasonFloor, review.confidence),
          ),
        },
  }
}
