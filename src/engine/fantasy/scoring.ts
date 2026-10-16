import type { MatchResult, Position } from '../model/types.ts'

/**
 * Points of the online fantasy game. They come only from the match the engine
 * plays, never from real football: the rating, plus a few counted events.
 */
export const SCORING = {
  /** Points for each rating point above (or below) `par`, over a full match. */
  rating: 2.5,
  par: 5.5,
  goal: { G: 10, Z: 9, L: 9, M: 7, A: 5 } as Record<Position, number>,
  /** Each of the player's shots that the keeper stops, and each one that goes wide. */
  shotSaved: 0.5,
  shotWide: 0.2,
  /** Each save, for the keeper. */
  save: 0.4,
  /** Not letting a goal in, for whoever played at least `cleanSheetMinutes`. */
  cleanSheet: { G: 3, Z: 5, L: 6, M: 2, A: 0 } as Record<Position, number>,
  cleanSheetMinutes: 60,
  /** Each goal let in while in goal. */
  conceded: -1,
  yellow: -1,
  red: -5,
  /** The captain's points count this many times. */
  captain: 1.5,
}

/** What one player did in one match, as the fantasy game counts it. */
export type PlayerMatch = {
  playerId: string
  clubId: string
  /** The slot he last played in. */
  position: Position
  minutes: number
  rating: number
  goals: number
  /** His shots that the keeper stopped, and the ones that went wide. */
  shotsSaved: number
  shotsWide: number
  saves: number
  /** Goals his side let in while he was on the pitch. */
  conceded: number
  yellow: boolean
  red: boolean
}

const FULL_TIME = 90

/** Breaks a match down into what each player who took part did in it. */
export function playerMatches(result: MatchResult): PlayerMatch[] {
  const on = new Map<string, number>()
  const off = new Map<string, number>()
  for (const event of result.events) {
    if (event.type === 'substituicao' && event.playerId && event.otherPlayerId) {
      off.set(event.playerId, event.minute)
      on.set(event.otherPlayerId, event.minute)
    }
    if (event.type === 'vermelho' && event.playerId) off.set(event.playerId, event.minute)
  }
  const onPitchAt = (id: string, minute: number) =>
    (on.get(id) ?? 0) <= minute && minute <= (off.get(id) ?? FULL_TIME)

  const lines = new Map<string, PlayerMatch>()
  for (const side of ['home', 'away'] as const) {
    const clubId = side === 'home' ? result.homeId : result.awayId
    for (const [playerId, position] of Object.entries(result.played[side])) {
      lines.set(playerId, {
        playerId,
        clubId,
        position,
        minutes: Math.max(0, (off.get(playerId) ?? FULL_TIME) - (on.get(playerId) ?? 0)),
        rating: result.ratings[playerId] ?? 6,
        goals: 0,
        shotsSaved: 0,
        shotsWide: 0,
        saves: 0,
        conceded: 0,
        yellow: false,
        red: false,
      })
    }
  }

  for (const event of result.events) {
    const line = event.playerId ? lines.get(event.playerId) : undefined
    if (event.type === 'gol' && line) line.goals++
    if (event.type === 'defesa' && line) line.shotsSaved++
    if (event.type === 'chance' && line) line.shotsWide++
    if (event.type === 'amarelo' && line) line.yellow = true
    if (event.type === 'vermelho' && line) line.red = true
    if (event.type === 'gol' || event.type === 'defesa') {
      // The event names the attacking side; the men defending it let the goal in or made the save.
      for (const other of lines.values()) {
        if (other.clubId === event.clubId || !onPitchAt(other.playerId, event.minute)) continue
        if (event.type === 'gol') other.conceded++
        else if (other.position === 'G') other.saves++
      }
    }
  }
  return [...lines.values()]
}

const tenth = (x: number) => Math.round(x * 10) / 10

/** A player's points for one match. */
export function matchPoints(line: PlayerMatch): number {
  const keeper = line.position === 'G'
  const cleanSheet = line.conceded === 0 && line.minutes >= SCORING.cleanSheetMinutes
  return tenth(
    SCORING.rating * (line.rating - SCORING.par) * Math.min(1, line.minutes / FULL_TIME) +
      SCORING.goal[line.position] * line.goals +
      SCORING.shotSaved * line.shotsSaved +
      SCORING.shotWide * line.shotsWide +
      (keeper ? SCORING.save * line.saves + SCORING.conceded * line.conceded : 0) +
      (cleanSheet ? SCORING.cleanSheet[line.position] : 0) +
      (line.yellow && !line.red ? SCORING.yellow : 0) +
      (line.red ? SCORING.red : 0),
  )
}

/** Everyone's points in a round, from its matches. */
export function roundPoints(results: readonly MatchResult[]): Record<string, number> {
  const points: Record<string, number> = {}
  for (const result of results) {
    for (const line of playerMatches(result)) points[line.playerId] = matchPoints(line)
  }
  return points
}
