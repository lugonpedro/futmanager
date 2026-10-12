import type { Player, PlayStyle, Position } from '../model/types.ts'
import {
  generateAttributes,
  overallAt,
  pickFeet,
  pickStyles,
  secondaryPositions,
} from '../player/attributes.ts'
import type { Rng } from '../rng.ts'
import { playerName } from './names.ts'

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)))

/** Monthly wage of an overall-30 player, in reais. */
export const BASE_WAGE = 15_000

/** Monthly wage grows exponentially with the overall, rounded to the nearest 1000. */
export function wageFor(overall: number): number {
  return Math.round((BASE_WAGE * Math.exp(0.06 * (overall - 30))) / 1000) * 1000
}

/** Young players with room to grow are worth more; veterans lose value fast. */
export function marketValueFor(overall: number, potential: number, age: number): number {
  const ageFactor = age <= 23 ? 1.3 : age <= 29 ? 1 : age <= 32 ? 0.6 : 0.3
  const growth = 1 + (potential - overall) / 50
  return Math.round((wageFor(overall) * 24 * ageFactor * growth) / 10_000) * 10_000
}

export type PlayerSeed = {
  id: string
  clubId: string
  position: Position
  /** Average overall of the club's squad. */
  level: number
  season: number
}

/** A player's skills and the numbers that follow from them, for a given overall. */
export function playerProfile(
  rng: Rng,
  position: Position,
  overall: number,
  styles: PlayStyle[] = pickStyles(rng, position, overall),
): Pick<Player, 'attributes' | 'overall' | 'secondary' | 'styles' | 'foot' | 'weakFoot'> {
  const attributes = generateAttributes(rng, position, overall, styles)
  return {
    attributes,
    overall: overallAt(attributes, position),
    secondary: secondaryPositions(attributes, position),
    styles,
    ...pickFeet(rng),
  }
}

export function generatePlayer(rng: Rng, seed: PlayerSeed): Player {
  const age = clamp(rng.normal(26, 4.5), 17, 37)
  const target = clamp(rng.normal(seed.level, 7), 1, 99)
  // Young players can still improve a lot; past 29 they have peaked.
  const room =
    age <= 21 ? rng.int(5, 25) : age <= 25 ? rng.int(0, 12) : age <= 29 ? rng.int(0, 4) : 0
  const name = playerName(rng)
  const profile = playerProfile(rng, seed.position, target)
  const potential = clamp(profile.overall + room, profile.overall, 99)

  return {
    id: seed.id,
    name,
    age,
    position: seed.position,
    ...profile,
    potential,
    wage: wageFor(profile.overall),
    marketValue: marketValueFor(profile.overall, potential, age),
    contractUntil: seed.season + rng.int(0, 3),
    clubId: seed.clubId,
  }
}

/**
 * A 16 to 18 year old from the club's academy: well below the first team for
 * now, with plenty of room to grow, on a cheap three-season contract.
 */
export function generateYouth(rng: Rng, seed: PlayerSeed): Player {
  const age = rng.int(16, 18)
  const target = clamp(rng.normal(seed.level - 15, 6), 15, 80)
  const room = rng.int(10, 35)
  const name = playerName(rng)
  const profile = playerProfile(rng, seed.position, target)
  const potential = clamp(profile.overall + room, profile.overall, 99)
  return {
    id: seed.id,
    name,
    age,
    position: seed.position,
    ...profile,
    potential,
    wage: wageFor(profile.overall),
    marketValue: marketValueFor(profile.overall, potential, age),
    contractUntil: seed.season + 2,
    clubId: seed.clubId,
  }
}
