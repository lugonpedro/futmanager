import type { Club, Cup, CupStage, Fixture, MatchResult } from '../model/types.ts'
import type { Rng } from '../rng.ts'
import type { GameDate } from './calendar.ts'
import { toFixtureResult } from './results.ts'
import { topScorers, type ScorerRow } from './standings.ts'

export const CUP_ID = 'COPA'
export const CUP_NAME = 'Copa Nacional'
/** League rounds whose following Wednesday has a cup stage, the final last. */
export const CUP_ROUNDS = [5, 11, 17, 23, 29, 35]
/** Prize for winning the final; each stage before pays a little under half the next. */
export const CUP_FINAL_PRIZE = 12_000_000

const NAMED_STAGES: Record<number, string> = {
  2: 'Final',
  4: 'Semifinal',
  8: 'Quartas de final',
  16: 'Oitavas de final',
}

/**
 * Every club enters a single-match knockout. When the number of clubs is not a
 * power of two, the lowest-ranked play a first round and the rest wait for them.
 * `dates` has the day of the stage after each of CUP_ROUNDS.
 */
export function createCup(clubs: readonly Club[], rng: Rng, dates: readonly GameDate[]): Cup {
  const ranked = [...clubs].sort((a, b) => b.reputation - a.reputation || a.id.localeCompare(b.id))
  const main = 2 ** Math.floor(Math.log2(ranked.length))
  const firstRound = ranked.length === main ? ranked.length : 2 * (ranked.length - main)
  const sizes = [firstRound]
  for (let size = ranked.length === main ? main / 2 : main; size >= 2; size /= 2) sizes.push(size)
  if (sizes.length > CUP_ROUNDS.length) throw new Error('Too many clubs for the cup calendar')
  const rounds = CUP_ROUNDS.slice(-sizes.length)
  const days = dates.slice(-sizes.length)

  // A first round of a few clubs is no round of 16, whatever its size.
  const ordinal = ['Primeira', 'Segunda', 'Terceira', 'Quarta']
  const stages: CupStage[] = sizes.map((size, i) => ({
    name:
      (i > 0 || ranked.length === main ? NAMED_STAGES[size] : undefined) ??
      `${ordinal[i] ?? 'Outra'} fase`,
    round: rounds[i],
    date: days[i],
    ties: [],
  }))
  const entrants = ranked.slice(-firstRound).map((c) => c.id)
  stages[0] = { ...stages[0], ties: drawTies(entrants, 0, stages[0], rng) }
  return { stages, byes: ranked.slice(0, -firstRound).map((c) => c.id) }
}

function drawTies(
  clubIds: readonly string[],
  stage: number,
  { round, date }: Pick<CupStage, 'round' | 'date'>,
  rng: Rng,
): Fixture[] {
  const drawn = rng.shuffle(clubIds)
  const ties: Fixture[] = []
  for (let i = 0; i < drawn.length; i += 2) {
    ties.push({
      id: `${CUP_ID}-${stage + 1}-${i / 2 + 1}`,
      leagueId: CUP_ID,
      round,
      date,
      homeId: drawn[i],
      awayId: drawn[i + 1],
    })
  }
  return ties
}

/** Five kicks each at 75%, then sudden death. */
export function shootout(rng: Rng): { home: number; away: number } {
  const kick = () => (rng.next() < 0.75 ? 1 : 0)
  let home = 0
  let away = 0
  for (let i = 0; i < 5; i++) {
    home += kick()
    away += kick()
  }
  while (home === away) {
    home += kick()
    away += kick()
  }
  return { home, away }
}

export function tieWinner(tie: Fixture): string | undefined {
  const { result } = tie
  if (!result) return undefined
  const home = result.homeGoals + (result.penalties?.home ?? 0) / 100
  const away = result.awayGoals + (result.penalties?.away ?? 0) / 100
  return home > away ? tie.homeId : tie.awayId
}

/** The next stage to be played, once drawn; -1 when there is none. */
export const nextCupStage = (cup: Cup | undefined) =>
  cup?.stages.findIndex((s) => s.ties.length > 0 && !s.ties[0].result) ?? -1

/** What winning a tie at a stage pays. */
export function cupPrize(cup: Cup, stage: number): number {
  const fromFinal = cup.stages.length - 1 - stage
  return Math.round(CUP_FINAL_PRIZE / 2.2 ** fromFinal / 10_000) * 10_000
}

/**
 * Plays a cup stage with the given match engine, settles level ties on
 * penalties and draws the next stage among the winners.
 */
export function playCupStage(
  cup: Cup,
  stage: number,
  play: (tie: Fixture) => MatchResult,
  rng: Rng,
): { cup: Cup; results: MatchResult[]; winners: string[] } {
  const results: MatchResult[] = []
  const ties = cup.stages[stage].ties.map((tie) => {
    const match = play(tie)
    results.push(match)
    const result = toFixtureResult(match)
    if (result.homeGoals === result.awayGoals) result.penalties = shootout(rng)
    return { ...tie, result }
  })
  const winners = ties.map((tie) => tieWinner(tie)!)
  const stages = [...cup.stages]
  stages[stage] = { ...stages[stage], ties }
  const next = stages[stage + 1]
  if (next) {
    const entrants = stage === 0 ? [...cup.byes, ...winners] : winners
    stages[stage + 1] = { ...next, ties: drawTies(entrants, stage + 1, next, rng) }
  }
  return { cup: { ...cup, stages }, results, winners }
}

export function cupWinner(cup: Cup | undefined): string | undefined {
  const final = cup?.stages.at(-1)?.ties[0]
  return final && tieWinner(final)
}

/** Goals scored in the cup so far, most first. Shootout kicks don't count. */
export function cupScorers(cup: Cup | undefined): ScorerRow[] {
  return topScorers(cup?.stages.flatMap((s) => s.ties) ?? [])
}

/** The club's cup tie still to be played, if it is alive and drawn. */
export function nextCupTie(cup: Cup | undefined, clubId: string): Fixture | undefined {
  for (const stage of cup?.stages ?? []) {
    const tie = stage.ties.find((t) => !t.result && (t.homeId === clubId || t.awayId === clubId))
    if (tie) return tie
  }
  return undefined
}

/** "Nas Oitavas de final", "Na Final". */
const at = (stage: string) => `${stage.endsWith('s de final') ? 'Nas' : 'Na'} ${stage}`

/** How far a club has gone: "Campeã", "Vice", "Caiu nas quartas de final" or "Nas Oitavas de final". */
export function cupProgress(cup: Cup | undefined, clubId: string): string | undefined {
  if (!cup) return undefined
  let reached: string | undefined
  for (const [i, stage] of cup.stages.entries()) {
    const tie = stage.ties.find((t) => t.homeId === clubId || t.awayId === clubId)
    if (!tie) {
      if (i === 1 && cup.byes.includes(clubId) && !reached) reached = at(stage.name)
      continue
    }
    if (!tie.result) return at(stage.name)
    if (tieWinner(tie) !== clubId) {
      return i === cup.stages.length - 1 ? 'Vice-campeão' : `Caiu ${at(stage.name).toLowerCase()}`
    }
    if (i === cup.stages.length - 1) return 'Campeão'
    reached = at(cup.stages[i + 1].name)
  }
  return reached
}
