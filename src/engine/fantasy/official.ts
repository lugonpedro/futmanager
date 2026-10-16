import type { MatchReplay } from '../match/simulate.ts'
import type { GameState, MatchResult, Player, Position } from '../model/types.ts'
import type { DataPack } from '../pack/pack.ts'
import type { GameDate } from '../season/calendar.ts'
import {
  isSeasonOver,
  newGame,
  playMatchDayWithResults,
  startNextSeason,
} from '../season/season.ts'
import { nextPrice, PRICES, startingPrice } from './prices.ts'
import { roundPoints } from './scoring.ts'

/**
 * Changes whenever the rules or the engine would score the same round
 * differently, so each official season records which rules it was played by.
 */
export const FANTASY_VERSION = 2

/**
 * The official season the whole online game shares, as the server keeps it.
 * Every club is run by the AI; the seed stays on the server, or anyone could
 * play the rounds ahead.
 */
export type OfficialState = {
  game: GameState
  /** Current price of everyone who has played in or belonged to the top division. */
  prices: Record<string, number>
  /** Points in the last matches each player played, newest last. */
  recent: Record<string, number[]>
}

/** A player as the fantasy market shows him for the next round. */
export type PoolPlayer = { name: string; clubId: string; position: Position; price: number }

export type OfficialClub = {
  name: string
  shortName: string
  colors: { primary: string; secondary: string }
}

/** What a played round leaves for everyone to read. */
export type OfficialRound = {
  /** League round, from 1; 0 is the market before the first one. */
  round: number
  /** Game date of the round, or of the season's start for round 0. */
  date: GameDate
  /** The top-division matches of the round. */
  results: MatchResult[]
  /** Everyone's points in those matches. */
  points: Record<string, number>
  /** Who can be picked for the next round, at the prices after this one. */
  pool: Record<string, PoolPlayer>
  /** What it takes to watch each of `results` again, in the same order. */
  replays: MatchReplay[]
}

const topDivision = (game: GameState) => game.world.leagues.find((l) => l.division === 1)!

/** The top division's clubs, for the market and the round pages. */
export function officialClubs(state: OfficialState): Record<string, OfficialClub> {
  const { clubs } = state.game.world
  return Object.fromEntries(
    topDivision(state.game).clubIds.map((id) => {
      const { name, shortName, colors } = clubs[id]
      return [id, { name, shortName, colors }]
    }),
  )
}

/** League rounds in the season. */
export const officialRounds = (state: OfficialState) =>
  Object.values(state.game.season.fixtures)[0]?.length ?? 0

export const officialSeasonOver = (state: OfficialState) => isSeasonOver(state.game.season)

/** Everyone in the top division now, with a price for those who have none yet. */
function pool(game: GameState, prices: Record<string, number>): Record<string, PoolPlayer> {
  const out: Record<string, PoolPlayer> = {}
  for (const clubId of topDivision(game).clubIds) {
    for (const id of game.world.clubs[clubId].playerIds) {
      const player = game.world.players[id]
      prices[id] ??= startingPrice(player.overall)
      out[id] = { name: player.name, clubId, position: player.position, price: prices[id] }
    }
  }
  return out
}

/**
 * A fresh seed for the world before each step. A replay gives away the seed
 * its match was played with, and from it the world's; with a new one each
 * time, what it gives away is already in the past.
 */
const reseeded = (game: GameState, seed: number): GameState => ({
  ...game,
  world: { ...game.world, seed },
})

/** Only the players a replay needs, without their past seasons. */
function slim(replay: MatchReplay): MatchReplay {
  const { home, away } = replay.input
  const ids = [home, away].flatMap((t) => [
    ...t.lineup.starters.map((s) => s.playerId),
    ...t.lineup.bench,
  ])
  const players: Record<string, Player> = {}
  for (const id of ids) {
    const { history: _history, ...player } = replay.input.players[id]
    players[id] = player
  }
  return { ...replay, input: { ...replay.input, players } }
}

/**
 * Nobody manages the game's own club: the board's verdict is ignored, so the
 * season always goes on. The club itself is the weakest of the second
 * division, where being left alone matters least.
 */
const managed = (game: GameState): GameState =>
  game.career.status === 'empregado' && game.career.confidence >= 50
    ? game
    : { ...game, career: { ...game.career, status: 'empregado', confidence: 50 } }

function opening(game: GameState): { state: OfficialState; round: OfficialRound } {
  const prices: Record<string, number> = {}
  const state = { game, prices, recent: {} }
  return {
    state,
    round: {
      round: 0,
      date: game.today,
      results: [],
      points: {},
      pool: pool(game, prices),
      replays: [],
    },
  }
}

/** A new official world from the data pack, with its opening market. */
export function startOfficialSeason(
  seed: number,
  pack: DataPack,
): { state: OfficialState; round: OfficialRound } {
  const probe = newGame(seed, 'C1', pack)
  const second = probe.world.leagues.find((l) => l.division === 2)!
  const weakest = [...second.clubIds].sort(
    (a, b) => probe.world.clubs[a].reputation - probe.world.clubs[b].reputation,
  )[0]
  return opening(newGame(seed, weakest, pack))
}

/**
 * The same world's next season, with prices set afresh from the overall.
 * `seed` is new randomness from the server, as for playOfficialRound().
 */
export function nextOfficialSeason(
  state: OfficialState,
  seed: number,
): {
  state: OfficialState
  round: OfficialRound
} {
  return opening(startNextSeason(managed(reseeded(state.game, seed))))
}

/**
 * Plays the match days up to and including the next league round and scores
 * the top-division matches. Prices move only for those who played. `seed` is
 * new randomness from the server, so the replays published with the round
 * never tell what comes next.
 */
export function playOfficialRound(
  state: OfficialState,
  seed: number,
): {
  state: OfficialState
  round: OfficialRound
} {
  if (officialSeasonOver(state)) throw new Error('The season is over')
  const prices = { ...state.prices }
  const recent = { ...state.recent }
  let game = reseeded(state.game, seed)
  for (;;) {
    const played = playMatchDayWithResults(managed(game))
    game = played.game
    if (played.day.kind !== 'liga') continue

    const top = new Set(topDivision(played.game).clubIds)
    const shown = played.results.flatMap((result, i) =>
      top.has(result.homeId) ? [{ result, replay: played.replays[i] }] : [],
    )
    const results = shown.map((m) => m.result)
    const points = roundPoints(results)
    for (const [id, p] of Object.entries(points)) {
      recent[id] = [...(recent[id] ?? []), p].slice(-PRICES.recent)
      prices[id] = nextPrice(
        prices[id] ?? startingPrice(game.world.players[id].overall),
        recent[id],
      )
    }
    return {
      state: { game, prices, recent },
      round: {
        round: game.season.round - 1,
        date: played.day.date,
        results,
        points,
        pool: pool(game, prices),
        replays: shown.map((m) => slim(m.replay)),
      },
    }
  }
}
