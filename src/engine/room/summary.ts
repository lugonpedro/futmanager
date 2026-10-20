import { makePick, roomPhase } from './draft.ts'
import {
  playRoomRound,
  roomScorers,
  roomStandings,
  startLeague,
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
}

/** Turns a finished draft into the league: the picks made, in order, then the fixtures. */
export function leagueFromDraft(start: RoomState, picks: readonly DraftPick[]): RoomState {
  const drafted = picks.reduce((state, p) => makePick(state, p.teamId, p.playerId), start)
  return startLeague(drafted)
}

/**
 * Plays the next round with every team's best lineup, the injured and banned
 * left out. Until people can set their own lineups, everyone plays like the
 * robots do.
 */
export const playAutoRound = (state: RoomState, seed: number): PlayedRound =>
  playRoomRound({ ...state, lineups: {} }, seed)

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
  }
}
