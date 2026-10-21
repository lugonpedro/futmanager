import { dropUnknownDuties } from '../match/lineup.ts'
import type { MatchReplay } from '../match/simulate.ts'
import type { Lineup, Player } from '../model/types.ts'
import { conditionOn, formOf } from '../season/form.ts'
import { makePick, roomPhase } from './draft.ts'
import { primePlayer } from './prime.ts'
import {
  checkLineup,
  playRoomRound,
  roomScorers,
  roomStandings,
  roundLineup,
  squadOf,
  startLeague,
  unavailableOn,
  type PlayedRound,
} from './league.ts'
import type { DraftPick, RoomState } from './types.ts'

/** A match as the room's page shows it: the score and who scored. */
export type RoomMatchLine = {
  homeId: string
  awayId: string
  homeGoals: number
  awayGoals: number
  goals: { name: string; teamId: string; minute: number }[]
}

/** What the room's page needs after each round, kept with the round on the server. */
export type RoomSummary = {
  /** Rounds played so far. */
  played: number
  totalRounds: number
  standings: {
    teamId: string
    played: number
    wins: number
    draws: number
    losses: number
    goalsFor: number
    goalsAgainst: number
    points: number
  }[]
  /** The ten top scorers. */
  scorers: { name: string; teamId: string; goals: number }[]
  /** The matches of the round just played; empty before the first. */
  last: RoomMatchLine[]
  /** The matches of the next round; empty once the league is over. */
  next: { homeId: string; awayId: string }[]
  /** Best average rating among those who played at least half the rounds so far. */
  best?: { name: string; teamId: string; average: number }
}

/** Turns a finished draft into the league: the picks made, in order, then the fixtures. */
export function leagueFromDraft(start: RoomState, picks: readonly DraftPick[]): RoomState {
  const players = { ...start.players }
  for (const p of picks) {
    if (p.prime) players[p.playerId] = primePlayer(players[p.playerId], p.prime)
  }
  const drafted = picks.reduce((state, p) => makePick(state, p.teamId, p.playerId), {
    ...start,
    players,
  })
  return startLeague(drafted)
}

/**
 * Plays the next round with the lineups people saved for it. A saved lineup
 * that doesn't fit the squad is ignored; a team without one plays the lineup
 * of the last round, fixed for injuries and bans (see `roundLineup`).
 */
export function playSavedRound(
  state: RoomState,
  saved: Readonly<Record<string, Lineup>>,
  seed: number,
): PlayedRound {
  const lineups = { ...state.lineups }
  for (const [teamId, lineup] of Object.entries(saved)) {
    // A role picked before it left the game is dropped rather than the whole lineup.
    const kept = Array.isArray(lineup?.starters) ? dropUnknownDuties(lineup) : lineup
    if (!checkLineup(state, teamId, kept)) lineups[teamId] = kept
  }
  return playRoomRound({ ...state, lineups }, seed)
}

/** What a person needs to set their team for the next round, apart from the room's state. */
export type TeamSheet = {
  /** The squad, without the players' past seasons. */
  players: Player[]
  /** Energy for the next round, 0 to 100, by player. */
  condition: Record<string, number>
  /** Form, -2 to 2, by player. */
  form: Record<string, number>
  /** Injured or banned for the next round. */
  out: string[]
  /** The lineup the team plays if its person changes nothing. */
  lineup: Lineup
}

export function teamSheet(state: RoomState, teamId: string): TeamSheet {
  const squad = squadOf(state, teamId)
  return {
    players: squad.map(({ history: _history, ...player }) => player),
    condition: Object.fromEntries(squad.map((p) => [p.id, conditionOn(state, p, state.today)])),
    form: Object.fromEntries(squad.map((p) => [p.id, formOf(state, p.id)])),
    out: [...unavailableOn(state, state.today)].filter((id) => squad.some((p) => p.id === id)),
    lineup: roundLineup(state, teamId),
  }
}

/** Only the players a replay needs, without their past seasons, so a round's replays stay small. */
export function slimReplay(replay: MatchReplay): MatchReplay {
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

export function roomSummary(state: RoomState): RoomSummary {
  const played = state.round - 1
  const name = (id: string) => state.players[id]?.name ?? '?'
  const last = played > 0 ? state.fixtures[played - 1] : []
  return {
    played,
    totalRounds: state.fixtures.length,
    standings: roomStandings(state).map((row) => ({
      teamId: row.clubId,
      played: row.played,
      wins: row.wins,
      draws: row.draws,
      losses: row.losses,
      goalsFor: row.goalsFor,
      goalsAgainst: row.goalsAgainst,
      points: row.points,
    })),
    scorers: roomScorers(state)
      .slice(0, 10)
      .map((row) => ({ name: name(row.playerId), teamId: row.clubId, goals: row.goals })),
    last: last.map((f) => ({
      homeId: f.homeId,
      awayId: f.awayId,
      homeGoals: f.result?.homeGoals ?? 0,
      awayGoals: f.result?.awayGoals ?? 0,
      goals: (f.result?.goals ?? []).map((g) => ({
        name: name(g.playerId),
        teamId: g.clubId,
        minute: g.minute,
      })),
    })),
    next:
      roomPhase(state) === 'liga'
        ? state.fixtures[state.round - 1].map((f) => ({ homeId: f.homeId, awayId: f.awayId }))
        : [],
    best: bestPlayer(state, played),
  }
}

function bestPlayer(state: RoomState, played: number): RoomSummary['best'] {
  let best: RoomSummary['best']
  for (const [id, rating] of Object.entries(state.ratings)) {
    const player = state.players[id]
    if (!player || rating.games < Math.max(1, Math.ceil(played / 2))) continue
    const average = rating.total / rating.games
    if (!best || average > best.average) {
      best = { name: player.name, teamId: player.clubId, average: Math.round(average * 10) / 10 }
    }
  }
  return best
}
