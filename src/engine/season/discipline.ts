import type { MatchResult } from '../model/types.ts'
import type { Rng } from '../rng.ts'
import { addDays, type GameDate } from './calendar.ts'

/** Yellow cards that add up to a one-match ban. */
export const YELLOWS_FOR_SUSPENSION = 3
/** An injury keeps a player out from this many days to this many more, short ones far more often. */
export const INJURY_DAYS = { min: 8, spread: 30 }

/**
 * Who is out and who is close to a ban. The career keeps it in the season;
 * an online room keeps its own, counted in its rounds.
 */
export type Discipline = {
  /** The day each injured player can play again. */
  injuries: Record<string, GameDate>
  /** Matches each banned player still has to sit out. */
  suspensions: Record<string, number>
  /** Yellow cards towards the next ban. */
  yellowCards: Record<string, number>
}

/** How long an injury keeps a player out, in days: short ones far more often. */
export const injuryDays = (rng: Rng) =>
  INJURY_DAYS.min + Math.floor(rng.next() ** 2 * INJURY_DAYS.spread)

/** Counts down every ban by one round, dropping the ones that are over. */
function countDown(record: Record<string, number>): Record<string, number> {
  return Object.fromEntries(
    Object.entries(record)
      .map(([id, rounds]) => [id, rounds - 1] as const)
      .filter(([, rounds]) => rounds > 0),
  )
}

/**
 * The cards and injuries of a league round: bans already served count down,
 * a red card bans a player for the next match, three yellows too, and each
 * injury keeps a player out for `injuryDays` from `today`. `maxInjuryDays`
 * caps that, for rooms with short injuries; 0 means the player is fine for the
 * next match. The random draws are the same whatever the cap.
 */
export function applyDiscipline(
  current: Discipline,
  results: readonly MatchResult[],
  today: GameDate,
  rng: Rng,
  maxInjuryDays = Infinity,
): Discipline {
  const injuries = { ...current.injuries }
  const suspensions = countDown(current.suspensions)
  const yellowCards = { ...current.yellowCards }

  for (const result of results) {
    for (const id of result.injured) {
      const days = Math.min(injuryDays(rng), maxInjuryDays)
      if (days > 0) injuries[id] = addDays(today, days)
    }
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
  return { injuries, suspensions, yellowCards }
}
