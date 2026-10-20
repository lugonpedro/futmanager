import {
  BOARD,
  confidenceAfterMatch,
  confidenceAtClose,
  findJobOffers,
  newCareer,
} from '../career/board.ts'
import {
  applyPayments,
  ledgerTotals,
  matchdayPayments,
  payday,
  type Payments,
} from '../finance/finance.ts'
import {
  closeSponsorSeason,
  dropLapsedSponsorOffers,
  secondaryOffers,
  settleSponsorship,
  sponsorOffers,
  type LastSeason,
} from '../finance/sponsors.ts'
import { generateWorld } from '../generate/world.ts'
import { autoFormation, autoLineup, repairLineup } from '../match/lineup.ts'
import {
  createMatch,
  simulateMatch,
  type MatchInput,
  type MatchReplay,
  type MatchState,
} from '../match/simulate.ts'
import { applyPack, type DataPack } from '../pack/pack.ts'
import { ageWorld, developWorld, youthIntake } from '../progression/progression.ts'
import { injuryRisk, NO_TRAINING, recoveryRate } from '../progression/training.ts'
import type {
  CareerSeason,
  Fixture,
  GameState,
  LeagueOutcome,
  Lineup,
  MatchResult,
  Season,
  SeasonSummary,
  Sponsorship,
  World,
} from '../model/types.ts'
import { createRng, mixSeed, type Rng } from '../rng.ts'
import { returnLoans } from '../transfer/loans.ts'
import { closeContracts, dropLapsedOffers, marketRound } from '../transfer/market.ts'
import {
  addDays,
  dateOf,
  dateParts,
  daysFrom,
  inTransferWindow,
  MONTH_NAMES,
  SATURDAY,
  seasonDates,
  seasonStart,
  weekday,
  type GameDate,
} from './calendar.ts'
import {
  CUP_NAME,
  CUP_ROUNDS,
  cupPrize,
  cupProgress,
  cupWinner,
  createCup,
  nextCupStage,
  playCupStage,
} from './cup.ts'
import {
  bestPlayer,
  conditionOn,
  formOf,
  recordMatchDay,
  recordSeasonHistory,
  roundStars,
} from './form.ts'
import { applyDiscipline, injuryDays } from './discipline.ts'
import { toFixtureResult } from './results.ts'
import { PROMOTION_SPOTS } from './rules.ts'
import { createSchedule } from './schedule.ts'
import { standings, topScorers } from './standings.ts'

export { PROMOTION_SPOTS } from './rules.ts'
export { toFixtureResult } from './results.ts'

export { INJURY_DAYS, YELLOWS_FOR_SUSPENSION } from './discipline.ts'
/** Prize for winning each division; it falls steadily to a quarter of that for last place. */
export const CHAMPION_PRIZE: Record<number, number> = { 1: 30_000_000, 2: 8_000_000 }
/** Bumped when the save format changes; see upgradeGame(). */
export const SAVE_VERSION = 13

export { mixSeed } from '../rng.ts'

/** Rounds of a double round robin among the clubs of the biggest league. */
const roundsFor = (world: World) =>
  Math.max(...world.leagues.map((league) => 2 * (league.clubIds.length - 1)))

export function startSeason(world: World, year = world.season): Season {
  const rng = createRng(mixSeed(world.seed, year, 'calendario'))
  const totalRounds = roundsFor(world)
  const dates = seasonDates(year, totalRounds, CUP_ROUNDS)
  const fixtures = Object.fromEntries(
    world.leagues.map((league) => [
      league.id,
      createSchedule(league.id, league.clubIds, rng, dates.league),
    ]),
  )
  const cupRng = createRng(mixSeed(world.seed, year, 'copa'))
  return {
    year,
    round: 1,
    totalRounds,
    fixtures,
    injuries: {},
    suspensions: {},
    yellowCards: {},
    appearances: {},
    cup: createCup(Object.values(world.clubs), cupRng, dates.cup),
    fitness: {},
    ratings: {},
    roundStars: [],
  }
}

/** A new career in a generated world, with a data pack's names on it when one is given. */
export function newGame(seed: number, userClubId: string, pack?: DataPack): GameState {
  const generated = generateWorld(seed)
  const world = pack ? applyPack(generated, pack).world : generated
  if (!world.clubs[userClubId]) throw new Error(`Unknown club ${userClubId}`)
  const season = startSeason(world)
  const career = newCareer(world, userClubId)
  return {
    version: SAVE_VERSION,
    today: seasonStart(world.season),
    world,
    userClubId,
    season,
    ledger: [],
    market: { listed: {}, offers: [], news: [] },
    sponsorship: openSponsorship(world, userClubId, career.target, season),
    training: NO_TRAINING,
    loans: [],
    career,
    history: [],
    names: pack ? { pack: pack.name } : {},
    favorites: [],
  }
}

/**
 * Shirt offers for the user's club at the start of a season, open until the
 * first league round; after that the board signs the safest one.
 */
export function openSponsorship(
  world: World,
  clubId: string,
  target: number,
  season: Season,
  last?: LastSeason,
): Sponsorship {
  const rng = createRng(mixSeed(world.seed, season.year, clubId, 'patrocinio'))
  const offers = sponsorOffers(world.clubs[clubId], target, season.year, rng, last)
  const deadline = roundDate(season, 1)
  return { offers, ...(deadline && { deadline }), secondary: [], secondaryOffers: [] }
}

/** The league a club plays in this season. */
export function leagueOf(world: World, clubId: string): string {
  const league = world.leagues.find((l) => l.clubIds.includes(clubId))
  if (!league) throw new Error(`Club ${clubId} is in no league`)
  return league.id
}

export const isSeasonOver = (season: Season) => season.round > season.totalRounds

/** The day a league round is played on. */
export const roundDate = (season: Season, round = season.round): GameDate | undefined =>
  Object.values(season.fixtures)[0]?.[round - 1]?.[0]?.date

/** A day with football: a league round, or a stage of the cup. */
export type MatchDay = { date: GameDate } & ({ kind: 'liga' } | { kind: 'copa'; stage: number })

/** The next day with football in the calendar, if the season still has one. */
export function nextMatchDay(season: Season): MatchDay | undefined {
  const stage = nextCupStage(season.cup)
  const cupDate = stage >= 0 ? season.cup!.stages[stage].date : undefined
  const leagueDate = isSeasonOver(season) ? undefined : roundDate(season)
  if (cupDate && (!leagueDate || cupDate < leagueDate))
    return { date: cupDate, kind: 'copa', stage }
  return leagueDate ? { date: leagueDate, kind: 'liga' } : undefined
}

/** Every fixture of a match day. */
export function dayFixtures(season: Season, day: MatchDay): Fixture[] {
  return day.kind === 'liga' ? roundFixtures(season) : season.cup!.stages[day.stage].ties
}

const involves = (fixture: Fixture, clubId: string) =>
  fixture.homeId === clubId || fixture.awayId === clubId

/** The user's game on a match day, if the club plays. */
export const userGameOn = (game: GameState, day: MatchDay) =>
  dayFixtures(game.season, day).find((f) => involves(f, game.userClubId))

/** The user's next game as far as the calendar knows: a cup tie drawn before it, or the league. */
export function nextUserGame(game: GameState): Fixture | undefined {
  const league = userFixture(game)
  const stage = game.season.cup?.stages.find((s) =>
    s.ties.some((t) => !t.result && involves(t, game.userClubId)),
  )
  const tie = stage?.ties.find((t) => involves(t, game.userClubId))
  if (tie && (!league || tie.date < league.date)) return tie
  return league
}

/** Whether football goes on: the season has games left and the manager has a job. */
export const canPlayRound = (game: GameState) =>
  nextMatchDay(game.season) !== undefined && game.career.status === 'empregado'

/** The user's match day, when the calendar has reached it. */
export function todaysMatchDay(game: GameState): MatchDay | undefined {
  const day = nextMatchDay(game.season)
  return canPlayRound(game) && day?.date === game.today && userGameOn(game, day) ? day : undefined
}

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

/**
 * The user's lineup as he left it: players who left the club are replaced,
 * but injured and banned starters keep their place until he swaps them.
 * Without one saved, the best XI, fit or not.
 */
export function savedUserLineup(game: GameState): Lineup {
  const { world, userClubId, userLineup } = game
  const squad = world.clubs[userClubId].playerIds.map((id) => world.players[id])
  if (!userLineup) return autoLineup(squad, autoFormation(squad))
  return repairLineup(userLineup, squad)
}

/** Players banned or still injured on a day; an injury ending by then doesn't count. */
export function unavailableOn(season: Season, date: GameDate): Set<string> {
  const injured = Object.entries(season.injuries).filter(([, back]) => back > date)
  return new Set([...injured.map(([id]) => id), ...Object.keys(season.suspensions)])
}

/** Starters in the user's saved lineup who can't play his next match. */
export function unavailableStarters(game: GameState): string[] {
  const out = unavailableOn(game.season, nextUserGame(game)?.date ?? game.today)
  return savedUserLineup(game)
    .starters.map((s) => s.playerId)
    .filter((id) => out.has(id))
}

export function matchInput(game: GameState, fixture: Fixture): MatchInput {
  const { world, season } = game
  const home = clubLineup(game, fixture.homeId)
  const away = clubLineup(game, fixture.awayId)
  const ids = [home, away].flatMap((l) => [...l.starters.map((s) => s.playerId), ...l.bench])
  return {
    home: { club: world.clubs[fixture.homeId], lineup: home },
    away: { club: world.clubs[fixture.awayId], lineup: away },
    players: world.players,
    condition: Object.fromEntries(
      ids.map((id) => [
        id,
        conditionOn(season, world.players[id], fixture.date, recoveryRate(game, id)),
      ]),
    ),
    injuryRisk: {
      ...(fixture.homeId === game.userClubId && { home: injuryRisk(game.training) }),
      ...(fixture.awayId === game.userClubId && { away: injuryRisk(game.training) }),
    },
    form: Object.fromEntries(ids.map((id) => [id, formOf(season, id)])),
  }
}

/** Each fixture has its own seed, so watching a match live or skipping it gives the same result. */
export const matchSeed = (game: GameState, fixture: Fixture): number =>
  mixSeed(game.world.seed, game.season.year, fixture.id)

export const matchRng = (game: GameState, fixture: Fixture): Rng =>
  createRng(matchSeed(game, fixture))

export type LiveMatch = { fixture: Fixture; state: MatchState }

/** Every match of the next match day, ready to be played minute by minute. */
export function createMatchDayMatches(game: GameState): LiveMatch[] {
  const day = nextMatchDay(game.season)
  if (!day) throw new Error('The season is over')
  return dayFixtures(game.season, day).map((fixture) => ({
    fixture,
    state: createMatch(matchInput(game, fixture), matchRng(game, fixture)),
  }))
}

/** The calendar reaches a day: injured players who are fit again return, old bids lapse. */
function arrive(game: GameState, date: GameDate): GameState {
  if (date === game.today) return game
  const injuries = Object.fromEntries(
    Object.entries(game.season.injuries).filter(([, back]) => back > date),
  )
  return {
    ...game,
    today: date,
    season: { ...game.season, injuries },
    market: dropLapsedOffers(game.market, date),
    sponsorship: dropLapsedSponsorOffers(game.sponsorship, date),
  }
}

/** On the 1st of these months the players develop, for the month gone by. */
const DEVELOPMENT_MONTHS = new Set([5, 6, 7, 8, 9, 10, 11, 12])

/** "Mês de abril", for the payday lines. */
const monthNote = (date: GameDate) => `Mês de ${MONTH_NAMES[dateParts(date).month - 1]}`

/**
 * Moves the calendar on to `to`. Each month is paid as the calendar leaves its
 * 1st day; on Saturdays with no league in a transfer window the market has its
 * turn too. With `stopOnOffers`, it stops on the day a club bids for one of the
 * user's players, so the manager can answer before the bid lapses.
 */
export function passDays(
  game: GameState,
  to: GameDate,
  stopOnOffers = false,
): { game: GameState; stopped: boolean } {
  if (to <= game.today) return { game, stopped: false }
  const leagueDays = new Set(Object.values(game.season.fixtures)[0]?.map((round) => round[0].date))
  let next = game
  for (const day of daysFrom(game.today, to)) {
    if (dateParts(day).day === 1) {
      next = settleSponsorship(arrive(next, day))
      next = applyPayments(next, payday(next, monthNote(day)))
      next = secondaryOffers(next, createRng(mixSeed(next.world.seed, day, 'patrocinio-menor')))
      if (DEVELOPMENT_MONTHS.has(dateParts(day).month)) {
        next = developWorld(next, createRng(mixSeed(next.world.seed, day, 'evolucao')))
      }
    }
    const tomorrow = addDays(day, 1)
    if (weekday(tomorrow) === SATURDAY && inTransferWindow(tomorrow) && !leagueDays.has(tomorrow)) {
      next = arrive(next, tomorrow)
      const offers = next.market.offers.length
      next = marketRound(next, createRng(mixSeed(next.world.seed, tomorrow, 'mercado')))
      if (stopOnOffers && next.market.offers.length > offers && tomorrow < to) {
        return { game: next, stopped: true }
      }
    }
  }
  return { game: settleSponsorship(arrive(next, to)), stopped: false }
}

/**
 * Records the results of the next match day, a league round or a cup stage,
 * after moving the calendar to it.
 */
export function applyMatchDay(game: GameState, results: readonly MatchResult[]): GameState {
  const day = nextMatchDay(game.season)
  if (!day) throw new Error('The season is over')
  const ready = passDays(game, day.date).game
  return day.kind === 'liga' ? applyRound(ready, results) : playCup(ready, day.stage, results)
}

/**
 * Records the results of the current league round and moves on to the next.
 * Red cards ban a player for the next league match, three yellows too, and
 * injuries keep a player out for a week to a month, short ones far more often.
 */
function applyRound(game: GameState, results: readonly MatchResult[]): GameState {
  const { season } = game
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

  const discipline = applyDiscipline(
    season,
    results,
    game.today,
    createRng(mixSeed(game.world.seed, season.year, season.round, 'lesoes')),
  )
  const appearances = { ...season.appearances }
  for (const result of results) countAppearances(game, result, appearances)

  const recorded: GameState = {
    ...game,
    season: {
      ...season,
      fixtures,
      ...discipline,
      appearances,
      ...recordMatchDay(season, results, game.today),
      roundStars: roundStars(results, game.world.players),
    },
  }
  const judged = judgeManager(recorded, results)

  // Gate money uses the table as it stood before these results.
  const settled = marketRound(
    applyPayments(judged, matchdayPayments(game, roundFixtures(season))),
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
 * A cup stage with its results: level ties go to penalties, injuries carry
 * into the league (cards stay in the cup), prize money for each winner.
 */
function playCup(game: GameState, stage: number, results: readonly MatchResult[]): GameState {
  const { season, world } = game
  if (!season.cup) throw new Error('No cup this season')
  const byClubs = new Map(results.map((r) => [`${r.homeId}>${r.awayId}`, r]))
  const rng = createRng(mixSeed(world.seed, season.year, 'copa', stage))
  const played = playCupStage(
    season.cup,
    stage,
    (tie) => {
      const result = byClubs.get(`${tie.homeId}>${tie.awayId}`)
      if (!result) throw new Error(`No result for ${tie.id}`)
      return result
    },
    rng,
  )
  const injuries = { ...season.injuries }
  const appearances = { ...season.appearances }
  for (const result of played.results) {
    countAppearances(game, result, appearances)
    for (const id of result.injured) {
      const back = addDays(game.today, injuryDays(rng))
      if (!injuries[id] || injuries[id] < back) injuries[id] = back
    }
  }
  const prize = cupPrize(season.cup, stage)
  const payments: Payments = { cash: {}, entries: [] }
  for (const id of played.winners) payments.cash[id] = prize
  if (played.winners.includes(game.userClubId)) {
    payments.entries.push({
      date: game.today,
      category: 'premiacao',
      amount: prize,
      note: `${CUP_NAME}, ${season.cup.stages[stage].name.toLowerCase()}`,
    })
  }
  return applyPayments(
    {
      ...game,
      season: {
        ...season,
        cup: played.cup,
        injuries,
        appearances,
        ...recordMatchDay(season, played.results, game.today),
      },
    },
    payments,
  )
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

/**
 * Moves the calendar to the next match day and plays all of it at once,
 * handing back the matches too, for anything that scores them.
 */
export function playMatchDayWithResults(game: GameState): {
  game: GameState
  day: MatchDay
  results: MatchResult[]
  /** What it takes to play each of `results` again. */
  replays: MatchReplay[]
} {
  const day = nextMatchDay(game.season)
  if (!day) throw new Error('The season is over')
  const ready = passDays(game, day.date).game
  const replays = dayFixtures(ready.season, day).map((fixture) => ({
    input: matchInput(ready, fixture),
    seed: matchSeed(ready, fixture),
  }))
  const results = replays.map((r) => simulateMatch(r.input, createRng(r.seed)))
  return { game: applyMatchDay(ready, results), day, results, replays }
}

/** Moves the calendar to the next match day and plays all of it at once. */
export function playMatchDay(game: GameState): GameState {
  return playMatchDayWithResults(game).game
}

/** Plays every match day up to and including the next league round. */
export function playRound(game: GameState): GameState {
  let next = game
  for (let day = nextMatchDay(next.season); day; day = nextMatchDay(next.season)) {
    next = playMatchDay(next)
    if (day.kind === 'liga') break
  }
  return next
}

/**
 * Moves the calendar to the user's next game, playing the match days on the
 * way that the club sits out. With `stopOnOffers` it stops early on a day a
 * club bids for one of the user's players.
 */
export function advanceToNextGame(game: GameState, stopOnOffers = true): GameState {
  let next = game
  for (let day = nextMatchDay(next.season); day; day = nextMatchDay(next.season)) {
    if (!canPlayRound(next)) break
    const passed = passDays(next, day.date, stopOnOffers)
    next = passed.game
    if (passed.stopped || userGameOn(next, day)) break
    next = playMatchDay(next)
  }
  return next
}

/**
 * Moves the calendar to `date`, playing every match day before it, the
 * user's games included. It stops on the date itself, before any game there,
 * so the manager can watch it; and earlier on a day a club bids for one of
 * the user's players, or once he has no job.
 */
export function simulateUntil(game: GameState, date: GameDate): GameState {
  let next = game
  for (
    let day = nextMatchDay(next.season);
    day && day.date < date;
    day = nextMatchDay(next.season)
  ) {
    if (!canPlayRound(next)) return next
    const passed = passDays(next, day.date, true)
    if (passed.stopped) return passed.game
    next = playMatchDay(passed.game)
  }
  if (next.career.status !== 'empregado') return next
  return passDays(next, date, true).game
}

/** Moves on to the user's next game and plays its whole match day. */
export function playNextGame(game: GameState): GameState {
  const ready = advanceToNextGame(game, false)
  return canPlayRound(ready) ? playMatchDay(ready) : ready
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
    const best = bestPlayer(game.world, game.season, league.clubIds)
    return {
      leagueId: league.id,
      division: league.division,
      table,
      promoted: i > 0 ? table.slice(0, PROMOTION_SPOTS) : [],
      relegated: i < leagues.length - 1 ? table.slice(-PROMOTION_SPOTS) : [],
      ...(scorer && { topScorer: scorer }),
      ...(best && { bestPlayer: best }),
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
  const final = seasonSummary(game)
  const prizes = final.prizes
  // December goes by with its wages paid, then prizes, then contracts running out.
  const december = passDays(game, dateOf(game.season.year, 12, 31)).game
  const seed = (label: string) => createRng(mixSeed(game.world.seed, game.season.year, label))
  // The shirt sponsor pays its bonus if the goal was met, and the deal goes on or ends.
  const userOutcome = final.leagues.find((l) => l.table.includes(game.userClubId))!
  const finalTie = game.season.cup?.stages.at(-1)?.ties[0]
  const sponsor = closeSponsorSeason(
    december.sponsorship,
    {
      division: userOutcome.division,
      position: userOutcome.table.indexOf(game.userClubId) + 1,
      promoted: userOutcome.promoted.includes(game.userClubId),
      cupFinal: finalTie?.homeId === game.userClubId || finalTie?.awayId === game.userClubId,
    },
    december.today,
    {
      relegated: userOutcome.relegated.includes(game.userClubId),
      moving,
      nextYear,
    },
  )
  const settled = applyPayments(december, {
    cash: sponsor.bonus ? { [game.userClubId]: sponsor.bonus.amount } : {},
    entries: [
      {
        date: december.today,
        category: 'premiacao',
        amount: prizes[game.userClubId] ?? 0,
        note: `Premiação da temporada ${game.season.year}`,
      },
      ...(sponsor.bonus ? [sponsor.bonus] : []),
    ],
  })
  // The last step of the year's development, then everyone back from loan, a year older.
  const developed = returnLoans(developWorld(settled, seed('evolucao')))
  const aged = ageWorld(recordSeasonHistory(developed.world, game.season), seed('idade'))
  const listed = Object.fromEntries(
    Object.entries(developed.market.listed).filter(
      ([id]) => aged.world.players[id]?.clubId === game.userClubId,
    ),
  )
  const youth = youthIntake(
    { ...developed, world: aged.world, market: { ...developed.market, listed } },
    nextYear,
    seed('base'),
  )
  const paid = closeContracts(youth.game, nextYear, seed('contratos'))
  const cupWinnerId = cupWinner(game.season.cup)
  const summary: SeasonSummary = {
    ...final,
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
  const nextSeason = startSeason(nextWorld)
  // A new club, or a deal that ran out, brings new shirt offers.
  const last = final.leagues.find((l) => l.table.includes(nextClubId))
  const shirt: Sponsorship = sponsor.master
    ? { master: sponsor.master, offers: [], secondary: [], secondaryOffers: [] }
    : openSponsorship(
        nextWorld,
        nextClubId,
        career.target,
        nextSeason,
        last && {
          champion: last.table[0] === nextClubId,
          promoted: last.promoted.includes(nextClubId),
          relegated: last.relegated.includes(nextClubId),
        },
      )
  // The smaller deals still running stay on; open offers lapse with the year.
  const sponsorship: Sponsorship = { ...shirt, secondary: sponsor.secondary }
  return {
    ...paid,
    today: seasonStart(nextYear),
    world: nextWorld,
    season: nextSeason,
    sponsorship,
    ledger: [],
    history: [...game.history, summary],
    ...(moving && {
      userClubId: nextClubId,
      userLineup: undefined,
      market: { ...paid.market, listed: {}, offers: [] },
      training: { ...paid.training, individual: {} },
      growth: undefined,
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
