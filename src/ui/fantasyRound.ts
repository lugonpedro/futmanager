import { SCORING } from '../engine/fantasy/scoring.ts'
import type { FantasyTeam } from '../engine/fantasy/team.ts'

/** A player of the team in a played round: his own points and what they counted for. */
export type ScoredPick = {
  id: string
  /** Undefined when he did not play. */
  points?: number
  captain: boolean
  counted: number
}

const tenth = (x: number) => Math.round(x * 10) / 10

/** The team's players with their points in the round, best first. */
export function scoredTeam(
  team: FantasyTeam,
  points: Readonly<Record<string, number>>,
): ScoredPick[] {
  return team.playerIds
    .map((id) => {
      const captain = id === team.captainId
      const own = points[id]
      return {
        id,
        points: own,
        captain,
        counted: tenth((own ?? 0) * (captain ? SCORING.captain : 1)),
      }
    })
    .sort((a, b) => b.counted - a.counted)
}

/** The `count` highest scorers of the round, best first; ties go by id, so the order holds. */
export function roundLeaders(
  points: Readonly<Record<string, number>>,
  count: number,
): [string, number][] {
  return Object.entries(points)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, count)
}
