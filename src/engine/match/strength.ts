import type { Player, PlayStyle, Position, Posture } from '../model/types.ts'
import { faceValue, overallAt, styleLevel } from '../player/attributes.ts'

export type Sectors = { defense: number; midfield: number; attack: number }

/** How much a player in each position adds to each sector. */
const WEIGHTS: Record<keyof Sectors, Record<Position, number>> = {
  defense: { G: 1.5, Z: 1, L: 0.7, M: 0.25, A: 0 },
  midfield: { G: 0, Z: 0.2, L: 0.5, M: 1, A: 0.3 },
  attack: { G: 0, Z: 0.1, L: 0.3, M: 0.5, A: 1 },
}

/** Total weight of a full 4-4-2, so a balanced XI rates close to its players' average. */
const REFERENCE: Record<Position, number> = { G: 1, Z: 2, L: 2, M: 4, A: 2 }
const NORMALIZER = Object.fromEntries(
  (Object.keys(WEIGHTS) as (keyof Sectors)[]).map((sector) => [
    sector,
    (Object.keys(REFERENCE) as Position[]).reduce(
      (sum, position) => sum + WEIGHTS[sector][position] * REFERENCE[position],
      0,
    ),
  ]),
) as Sectors

/**
 * Out of his own position a player loses a little on top of what his
 * attributes already say: less in a secondary one, more anywhere else.
 */
export const FAMILIARITY = { own: 1, secondary: 0.97, other: 0.92 }

export const familiarity = (player: Player, position: Position) =>
  player.position === position
    ? FAMILIARITY.own
    : player.secondary.includes(position)
      ? FAMILIARITY.secondary
      : FAMILIARITY.other

/**
 * How much of his overall a player keeps in a position: his attributes rated
 * for it, less a bit when it is not one of his. Anyone in goal is a disaster.
 */
export function positionFit(player: Player, position: Position): number {
  if (player.position === position) return 1
  const there = overallAt(player.attributes, position) / Math.max(1, player.overall)
  return Math.min(1, there) * familiarity(player, position)
}

/** Points a style adds where it counts, and twice as many for its "+". */
export const STYLE_POINTS = 1.5

export const styleBonus = (player: Player, ...styles: PlayStyle[]) =>
  styles.reduce((sum, style) => sum + STYLE_POINTS * styleLevel(player, style), 0)

/** Everything the match asks of a player, worked out once per player object. */
type Skills = {
  outfield: Sectors
  inGoal: Sectors
  keeper: number
  finishing: number
  heading: number
  pace: number
}

// Players are never changed in place, so a player object always has the same skills.
const skillCache = new WeakMap<Player, Skills>()

function skills(player: Player): Skills {
  const cached = skillCache.get(player)
  if (cached) return cached
  const { attributes } = player
  const face = (name: Parameters<typeof faceValue>[1]) => faceValue(attributes, name)
  const pas = face('PAS')
  const dri = face('DRI')
  const keeperStyles = styleBonus(player, 'paredao', 'colocacao')
  const computed: Skills = {
    outfield: {
      defense:
        0.65 * face('DEF') +
        0.2 * face('FIS') +
        0.15 * face('RIT') +
        styleBonus(player, 'muralha', 'desarmador'),
      midfield: 0.55 * pas + 0.3 * dri + 0.15 * face('FIS') + styleBonus(player, 'passador'),
      attack:
        0.4 * pas + 0.35 * dri + 0.25 * face('FIN') + styleBonus(player, 'armador', 'driblador'),
    },
    inGoal: { defense: overallAt(attributes, 'G') + keeperStyles, midfield: 0, attack: 0 },
    // Shot-stopping: reflexes, diving and positioning.
    keeper: (face('REF') + face('ELA') + face('POS')) / 3 + keeperStyles,
    // Finishing, with a word from the weaker foot.
    finishing: face('FIN') + (player.weakFoot - 3) + styleBonus(player, 'finalizador'),
    heading: 0.6 * attributes.heading + 0.4 * attributes.jumping + styleBonus(player, 'cabeceador'),
    pace: face('RIT') + 2 * styleBonus(player, 'velocista'),
  }
  skillCache.set(player, computed)
  return computed
}

export const keeperSkill = (player: Player) => skills(player).keeper
export const finishingSkill = (player: Player) => skills(player).finishing
export const headingSkill = (player: Player) => skills(player).heading
export const paceSkill = (player: Player) => skills(player).pace

/** What a player brings to each sector from where he stands, before fit and tiredness. */
export const sectorSkills = (player: Player, position: Position): Sectors =>
  position === 'G' ? skills(player).inGoal : skills(player).outfield

/** Form, from -2 to +2, moves a player's level by this much each step. */
export const FORM_EFFECT = 0.015

/** Share of his level a player gives right now: familiarity, tiredness and form. */
export const matchShape = (player: Player, position: Position, energy: number, form = 0) =>
  familiarity(player, position) * (0.8 + (0.2 * energy) / 100) * (1 + FORM_EFFECT * form)

export const POSTURE_EFFECT: Record<Posture, { attack: number; defense: number; tiring: number }> =
  {
    defensiva: { attack: 0.9, defense: 1.08, tiring: 0.9 },
    normal: { attack: 1, defense: 1, tiring: 1 },
    ofensiva: { attack: 1.1, defense: 0.92, tiring: 1.15 },
  }

/**
 * Sector ratings of the players on the pitch. Missing players (sent off, injured
 * with no subs left) simply add nothing, so the sectors drop.
 */
export function sectorStrength(
  onPitch: readonly { player: Player; position: Position; energy: number; form?: number }[],
  posture: Posture,
): Sectors {
  const totals: Sectors = { defense: 0, midfield: 0, attack: 0 }
  for (const { player, position, energy, form } of onPitch) {
    const shape = matchShape(player, position, energy, form)
    const skills = sectorSkills(player, position)
    for (const sector of Object.keys(totals) as (keyof Sectors)[]) {
      totals[sector] += WEIGHTS[sector][position] * skills[sector] * shape
    }
  }
  const effect = POSTURE_EFFECT[posture]
  return {
    defense: (totals.defense / NORMALIZER.defense) * effect.defense,
    midfield: totals.midfield / NORMALIZER.midfield,
    attack: (totals.attack / NORMALIZER.attack) * effect.attack,
  }
}
