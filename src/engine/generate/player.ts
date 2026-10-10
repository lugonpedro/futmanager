import type { Player, Position, Trait } from '../model/types.ts'
import type { Rng } from '../rng.ts'
import { playerName } from './names.ts'

const TRAITS_BY_POSITION: Record<Position, readonly Trait[]> = {
  G: ['reflexo', 'colocacao', 'saida'],
  Z: ['marcacao', 'desarme', 'cabeceio', 'velocidade'],
  L: ['marcacao', 'cruzamento', 'velocidade', 'passe'],
  M: ['passe', 'armacao', 'desarme', 'drible', 'finalizacao'],
  A: ['finalizacao', 'drible', 'cabeceio', 'velocidade'],
}

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, Math.round(value)))

/** Monthly wage of a strength-30 player, in reais. */
export const BASE_WAGE = 15_000

/** Monthly wage grows exponentially with strength, rounded to the nearest 1000. */
export function wageFor(strength: number): number {
  return Math.round((BASE_WAGE * Math.exp(0.06 * (strength - 30))) / 1000) * 1000
}

/** Young players with room to grow are worth more; veterans lose value fast. */
export function marketValueFor(strength: number, potential: number, age: number): number {
  const ageFactor = age <= 23 ? 1.3 : age <= 29 ? 1 : age <= 32 ? 0.6 : 0.3
  const growth = 1 + (potential - strength) / 50
  return Math.round((wageFor(strength) * 24 * ageFactor * growth) / 10_000) * 10_000
}

export type PlayerSeed = {
  id: string
  clubId: string
  position: Position
  /** Average strength of the club's squad. */
  level: number
  season: number
}

export function generatePlayer(rng: Rng, seed: PlayerSeed): Player {
  const age = clamp(rng.normal(26, 4.5), 17, 37)
  const strength = clamp(rng.normal(seed.level, 7), 1, 99)
  // Young players can still improve a lot; past 29 they have peaked.
  const room =
    age <= 21 ? rng.int(5, 25) : age <= 25 ? rng.int(0, 12) : age <= 29 ? rng.int(0, 4) : 0
  const potential = clamp(strength + room, strength, 99)

  const traitCount = strength >= 70 ? 2 : strength >= 50 ? rng.int(1, 2) : rng.int(0, 1)
  const traits = rng.shuffle(TRAITS_BY_POSITION[seed.position]).slice(0, traitCount)

  return {
    id: seed.id,
    name: playerName(rng),
    age,
    position: seed.position,
    strength,
    potential,
    traits,
    wage: wageFor(strength),
    marketValue: marketValueFor(strength, potential, age),
    contractUntil: seed.season + rng.int(0, 3),
    clubId: seed.clubId,
  }
}
