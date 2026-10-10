import type { Fixture, FixtureResult } from '../model/types.ts'

export const POINTS = { win: 3, draw: 1, loss: 0 }

export type Outcome = 'V' | 'E' | 'D'

export type StandingRow = {
  clubId: string
  played: number
  wins: number
  draws: number
  losses: number
  goalsFor: number
  goalsAgainst: number
  goalDifference: number
  points: number
  yellowCards: number
  redCards: number
  /** Last five results, oldest first. */
  form: Outcome[]
}

const emptyRow = (clubId: string): StandingRow => ({
  clubId,
  played: 0,
  wins: 0,
  draws: 0,
  losses: 0,
  goalsFor: 0,
  goalsAgainst: 0,
  goalDifference: 0,
  points: 0,
  yellowCards: 0,
  redCards: 0,
  form: [],
})

type Played = Fixture & { result: FixtureResult }

const isPlayed = (fixture: Fixture): fixture is Played => fixture.result !== undefined

function addResult(
  row: StandingRow,
  scored: number,
  conceded: number,
  yellow: number,
  red: number,
) {
  const outcome: Outcome = scored > conceded ? 'V' : scored === conceded ? 'E' : 'D'
  row.played++
  row.goalsFor += scored
  row.goalsAgainst += conceded
  row.goalDifference = row.goalsFor - row.goalsAgainst
  row.yellowCards += yellow
  row.redCards += red
  if (outcome === 'V') row.wins++
  else if (outcome === 'E') row.draws++
  else row.losses++
  row.points = row.wins * POINTS.win + row.draws * POINTS.draw
  row.form = [...row.form, outcome].slice(-5)
}

function tally(clubIds: readonly string[], fixtures: readonly Played[]) {
  const rows = new Map(clubIds.map((id) => [id, emptyRow(id)]))
  for (const { homeId, awayId, result } of [...fixtures].sort((a, b) => a.round - b.round)) {
    const home = rows.get(homeId)
    const away = rows.get(awayId)
    if (!home || !away) continue
    const { homeGoals, awayGoals, cards } = result
    addResult(home, homeGoals, awayGoals, cards.home.yellow, cards.home.red)
    addResult(away, awayGoals, homeGoals, cards.away.yellow, cards.away.red)
  }
  return rows
}

/** Points, wins, goal difference, goals scored: the first four criteria. */
const main = (a: StandingRow, b: StandingRow) =>
  b.points - a.points ||
  b.wins - a.wins ||
  b.goalDifference - a.goalDifference ||
  b.goalsFor - a.goalsFor

/**
 * League table, in the Brasileirão order: points, wins, goal difference, goals
 * scored, head to head between the tied clubs, fewest red cards, fewest yellow
 * cards. A draw of lots settles the rest; here the club id stands in for it so
 * the table never changes between two looks.
 */
export function standings(clubIds: readonly string[], fixtures: readonly Fixture[]): StandingRow[] {
  const played = fixtures.filter(isPlayed)
  const rows = [...tally(clubIds, played).values()].sort(main)

  const ordered: StandingRow[] = []
  for (let start = 0; start < rows.length;) {
    let end = start + 1
    while (end < rows.length && main(rows[start], rows[end]) === 0) end++
    const tied = rows.slice(start, end)
    if (tied.length === 1) {
      ordered.push(tied[0])
    } else {
      const ids = new Set(tied.map((row) => row.clubId))
      const headToHead = tally(
        [...ids],
        played.filter((f) => ids.has(f.homeId) && ids.has(f.awayId)),
      )
      const h2h = (row: StandingRow) => headToHead.get(row.clubId)!
      ordered.push(
        ...tied.sort(
          (a, b) =>
            h2h(b).points - h2h(a).points ||
            h2h(b).goalDifference - h2h(a).goalDifference ||
            a.redCards - b.redCards ||
            a.yellowCards - b.yellowCards ||
            a.clubId.localeCompare(b.clubId, 'en', { numeric: true }),
        ),
      )
    }
    start = end
  }
  return ordered
}

export type ScorerRow = { playerId: string; clubId: string; goals: number }

/** Top scorers over the given fixtures, most goals first. A player keeps the club they last scored for. */
export function topScorers(fixtures: readonly Fixture[]): ScorerRow[] {
  const rows = new Map<string, ScorerRow>()
  for (const fixture of fixtures) {
    for (const goal of fixture.result?.goals ?? []) {
      const row = rows.get(goal.playerId) ?? {
        playerId: goal.playerId,
        clubId: goal.clubId,
        goals: 0,
      }
      row.goals++
      row.clubId = goal.clubId
      rows.set(goal.playerId, row)
    }
  }
  return [...rows.values()].sort(
    (a, b) => b.goals - a.goals || a.playerId.localeCompare(b.playerId, 'en', { numeric: true }),
  )
}
