import { autoFormation, autoLineup, FORMATIONS, repairLineup } from '../match/lineup.ts'
import { ROLES_BY_POSITION } from '../match/roles.ts'
import { simulateMatch, type MatchInput, type MatchReplay } from '../match/simulate.ts'
import {
  POSITIONS,
  type Club,
  type Fixture,
  type Lineup,
  type MatchResult,
  type Player,
} from '../model/types.ts'
import { createRng, mixSeed } from '../rng.ts'
import { addDays, type GameDate } from '../season/calendar.ts'
import { applyDiscipline } from '../season/discipline.ts'
import { conditionOn, formOf, recordMatchDay, roundStars } from '../season/form.ts'
import { toFixtureResult } from '../season/results.ts'
import { createSchedule } from '../season/schedule.ts'
import { standings, topScorers } from '../season/standings.ts'
import { roomPhase, totalPicks } from './draft.ts'
import { ROOM_LIMITS, type RoomState } from './types.ts'

/** League id of a room's fixtures. */
const LEAGUE_ID = 'SALA'
/** Days between rounds: a week, so fatigue, injuries and bans run as in the career. */
const ROUND_DAYS = 7

/** A room's team as the match engine wants it: a club with no money or stadium. */
export function roomClub(state: RoomState, teamId: string): Club {
  const team = state.teams.find((t) => t.id === teamId)
  if (!team) throw new Error(`Unknown team ${teamId}`)
  return {
    id: team.id,
    name: team.name,
    shortName: team.shortName,
    city: '',
    colors: team.colors,
    reputation: 50,
    stadiumCapacity: 0,
    ticketPrice: 0,
    cash: 0,
    division: 1,
    playerIds: state.squads[teamId],
  }
}

export const squadOf = (state: RoomState, teamId: string): Player[] =>
  state.squads[teamId].map((id) => state.players[id])

/** Who can't play on a day: injured past it, or still serving a ban. */
export function unavailableOn(state: RoomState, date: GameDate): Set<string> {
  const { injuries, suspensions } = state.discipline
  const injured = Object.entries(injuries).filter(([, back]) => back > date)
  return new Set([...injured.map(([id]) => id), ...Object.keys(suspensions)])
}

/** The best lineup the team can field on its own, as robots and absent people get. */
export function bestLineup(state: RoomState, teamId: string): Lineup {
  const squad = squadOf(state, teamId)
  const out = unavailableOn(state, state.today)
  return autoLineup(squad, autoFormation(squad, out), 'normal', out)
}

/**
 * The lineup a team plays the next round with: a robot's best, or the last one
 * the person saved, with the injured and banned taken out and the gaps filled.
 */
export function roundLineup(state: RoomState, teamId: string): Lineup {
  const team = state.teams.find((t) => t.id === teamId)!
  const saved = state.lineups[teamId]
  if (team.robot || !saved) return bestLineup(state, teamId)
  return repairLineup(saved, squadOf(state, teamId), unavailableOn(state, state.today))
}

/** Why a person can't save this lineup for the next round, if they can't. */
export function checkLineup(state: RoomState, teamId: string, lineup: Lineup): string | undefined {
  if (roomPhase(state) !== 'liga') return 'A liga não está em andamento.'
  // A lineup may come from anyone's browser, so its shape is checked too.
  if (!Array.isArray(lineup?.starters) || !Array.isArray(lineup.bench)) return 'Escalação inválida.'
  if (!Object.hasOwn(FORMATIONS, lineup.formation)) return 'Formação inválida.'
  if (!['defensiva', 'normal', 'ofensiva'].includes(lineup.posture)) return 'Postura inválida.'
  const badSlot = (s: Lineup['starters'][number]) =>
    !POSITIONS.includes(s?.position) ||
    (s.role !== undefined && !ROLES_BY_POSITION[s.position].includes(s.role))
  if (lineup.starters.some(badSlot)) return 'Posição inválida.'
  const squad = new Set(state.squads[teamId])
  const ids = [...lineup.starters.map((s) => s.playerId), ...lineup.bench]
  if (lineup.starters.length !== 11) return 'A escalação precisa de 11 titulares.'
  if (new Set(ids).size !== ids.length) return 'Um jogador aparece duas vezes.'
  if (ids.some((id) => !squad.has(id))) return 'Só jogadores do seu elenco.'
  return undefined
}

/** Weekly dates for every round of the league, from the room's first day. */
const roundDates = (start: GameDate, rounds: number) =>
  Array.from({ length: rounds }, (_, i) => addDays(start, ROUND_DAYS * i))

/**
 * Turns a finished draft into a league: the fixtures for the chosen number of
 * legs, a week apart, and each team's best lineup to start from.
 */
export function startLeague(state: RoomState): RoomState {
  if (state.picks.length < totalPicks(state)) throw new Error('The draft is not over')
  if (state.fixtures.length > 0) throw new Error('The league has started already')
  const ids = state.teams.map((t) => t.id)
  const half = ids.length - 1
  const schedule = createSchedule(
    LEAGUE_ID,
    ids,
    createRng(mixSeed(state.seed, 'calendario')),
    roundDates(state.today, 2 * half),
  )
  // A third leg plays the first half again; the ids and dates follow on.
  const legs = state.options.legs === 3 ? [...schedule, ...schedule.slice(0, half)] : schedule
  const rounds = legs.slice(0, state.options.legs === 1 ? half : legs.length)
  const dates = roundDates(state.today, rounds.length)
  const fixtures = rounds.map((round, r) =>
    round.map((f, i) => ({
      ...f,
      id: `${LEAGUE_ID}-R${r + 1}-${i + 1}`,
      round: r + 1,
      date: dates[r],
    })),
  )
  const started = { ...state, fixtures }
  return {
    ...started,
    lineups: Object.fromEntries(ids.map((id) => [id, bestLineup(started, id)])),
  }
}

/** The league's last round, past which the room is over. */
export const totalRounds = (state: RoomState) => state.fixtures.length

/** Longest injury the room's option allows, in days. */
function injuryCap(state: RoomState): number {
  if (state.options.injuries === 'desligadas') return 0
  if (state.options.injuries === 'curtas') return ROOM_LIMITS.shortInjuryDays
  return Infinity
}

export type PlayedRound = {
  state: RoomState
  results: MatchResult[]
  /** What it takes to watch each match again. */
  replays: MatchReplay[]
}

/**
 * Plays the next round with each team's lineup for it. `seed` is drawn anew by
 * the server for every round, so a published replay never gives away the next
 * one. Cards, injuries, fatigue and form go on as in the career.
 */
export function playRoomRound(state: RoomState, seed: number): PlayedRound {
  if (roomPhase(state) !== 'liga') throw new Error('No round to play')
  const index = state.round - 1
  const date = state.today
  const lineups = Object.fromEntries(state.teams.map((t) => [t.id, roundLineup(state, t.id)]))

  const replays = state.fixtures[index].map((fixture): MatchReplay => {
    const home = lineups[fixture.homeId]
    const away = lineups[fixture.awayId]
    const ids = [home, away].flatMap((l) => [...l.starters.map((s) => s.playerId), ...l.bench])
    const input: MatchInput = {
      home: { club: roomClub(state, fixture.homeId), lineup: home },
      away: { club: roomClub(state, fixture.awayId), lineup: away },
      players: state.players,
      condition: Object.fromEntries(
        ids.map((id) => [id, conditionOn(state, state.players[id], date)]),
      ),
      form: Object.fromEntries(ids.map((id) => [id, formOf(state, id)])),
    }
    return { input, seed: mixSeed(seed, fixture.id) }
  })
  const results = replays.map((r) => simulateMatch(r.input, createRng(r.seed)))

  const byClubs = new Map(results.map((r) => [`${r.homeId}>${r.awayId}`, r]))
  const fixtures = state.fixtures.map((round, i) =>
    i !== index
      ? round
      : round.map((f): Fixture => ({
          ...f,
          result: toFixtureResult(byClubs.get(`${f.homeId}>${f.awayId}`)!),
        })),
  )
  const discipline = applyDiscipline(
    state.discipline,
    results,
    date,
    createRng(mixSeed(seed, 'lesoes')),
    injuryCap(state),
  )
  const next = state.fixtures[index + 1]?.[0]?.date ?? addDays(date, ROUND_DAYS)
  // Whoever is fit again by the next round drops off the list.
  const injuries = Object.fromEntries(
    Object.entries(discipline.injuries).filter(([, back]) => back > next),
  )

  return {
    state: {
      ...state,
      ...recordMatchDay(state, results, date),
      fixtures,
      discipline: { ...discipline, injuries },
      // The lineup each team played with is where the next one starts from.
      lineups: { ...state.lineups, ...lineups },
      round: state.round + 1,
      today: next,
    },
    results,
    replays,
  }
}

/** The table, best first, with the career's tiebreakers. */
export const roomStandings = (state: RoomState) =>
  standings(
    state.teams.map((t) => t.id),
    state.fixtures.flat(),
  )

export const roomScorers = (state: RoomState) => topScorers(state.fixtures.flat())

/** The best XI of a round that was just played. */
export const roomRoundStars = (state: RoomState, results: readonly MatchResult[]) =>
  roundStars(results, state.players)
