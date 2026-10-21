import type { Player, PlayStyle, Position, Posture, TacticalRole } from '../model/types.ts'
import { faceValue, overallAt, styleLevel, type AnyFace } from '../player/attributes.ts'
import {
  DEFAULT_ROLE,
  DUTIES_BY_POSITION,
  FORMATION_LINES,
  ROLE_SECTORS,
  ROLE_STYLES,
  ROLE_WEIGHTS,
  roleOf,
  sideOf,
} from './roles.ts'

export type Sectors = { defense: number; midfield: number; attack: number }

const SECTORS = ['defense', 'midfield', 'attack'] as const

/**
 * Total weight of a 4-4-2 of plain roles, so a balanced XI rates close to its
 * players' average.
 */
const NORMALIZER = Object.fromEntries(
  SECTORS.map((sector) => [
    sector,
    FORMATION_LINES['4-4-2']
      .flat()
      .reduce((sum, slot) => sum + ROLE_SECTORS[DEFAULT_ROLE[slot.position]][sector], 0),
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

/**
 * A player's level in a role: his attributes weighed for what it asks. In the
 * plain role of his own position, his overall.
 */
export function roleOverall(player: Player, role: TacticalRole): number {
  if (role === DEFAULT_ROLE[player.position]) return player.overall
  let total = 0
  for (const [face, weight] of Object.entries(ROLE_WEIGHTS[role])) {
    total += faceValue(player.attributes, face as AnyFace) * weight
  }
  return total
}

/** Share of his overall a player's level in a role may fall to and still suit it. */
export const ROLE_TOLERANCE = 0.92

/**
 * Like positionFit, for a slot of a formation: how well a player suits its
 * position and role. Players of the position suit any role close enough to
 * their overall; below that, the fit drops with the level in the role.
 */
export function slotFit(player: Player, slot: { position: Position; role?: TacticalRole }) {
  const role = roleOf(slot)
  if (role === DEFAULT_ROLE[slot.position]) return positionFit(player, slot.position)
  const there = roleOverall(player, role) / Math.max(1, player.overall) / ROLE_TOLERANCE
  return Math.min(1, there) * familiarity(player, slot.position)
}

/** The role of his own position a player is best at; the plain one when nothing beats it. */
export function bestRole(player: Player): TacticalRole {
  let best = DEFAULT_ROLE[player.position]
  for (const role of DUTIES_BY_POSITION[player.position]) {
    if (roleOverall(player, role) > roleOverall(player, best)) best = role
  }
  return best
}

/** Share a picked role gains for each level of a style that suits it. */
export const ROLE_STYLE_EFFECT = 0.015
/** Share a corta pra dentro gains on the wing of his weaker foot, and loses on the other. */
export const INSIDE_FOOT_EFFECT = 0.03

/**
 * How much more a player gives in the role the user picked for him: a bit for
 * each style that suits it, and for a corta pra dentro, which wing he is on.
 * Nothing changes in the role of his slot.
 */
export function dutyFactor(
  player: Player,
  slot: { role?: TacticalRole; duty?: TacticalRole },
): number {
  if (!slot.duty) return 1
  const styles = ROLE_STYLES[slot.duty] ?? []
  let factor = 1 + ROLE_STYLE_EFFECT * styles.reduce((sum, s) => sum + styleLevel(player, s), 0)
  const side = sideOf(slot.role)
  if (slot.duty === 'CPD' && side) {
    const inside = (side === 'direita') === (player.foot === 'esquerdo')
    factor *= 1 + (inside ? INSIDE_FOOT_EFFECT : -INSIDE_FOOT_EFFECT)
  }
  return factor
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
        styleBonus(player, 'muralha', 'desarmador', 'trator'),
      midfield:
        0.55 * pas + 0.3 * dri + 0.15 * face('FIS') + styleBonus(player, 'passador', 'trator'),
      attack:
        0.4 * pas + 0.35 * dri + 0.25 * face('FIN') + styleBonus(player, 'armador', 'driblador'),
    },
    inGoal: { defense: overallAt(attributes, 'G') + keeperStyles, midfield: 0, attack: 0 },
    // Shot-stopping: reflexes, diving and positioning.
    keeper: (face('REF') + face('ELA') + face('POS')) / 3 + keeperStyles,
    // Finishing, with a word from the weaker foot.
    finishing: face('FIN') + (player.weakFoot - 3) + styleBonus(player, 'finalizador', 'chutador'),
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
 * Sector ratings of the players on the pitch, each weighed by his role: a
 * volante adds to the defence, a meia ofensivo and the pontas to the attack.
 * Missing players (sent off, injured with no subs left) simply add nothing,
 * so the sectors drop.
 */
export function sectorStrength(
  onPitch: readonly {
    player: Player
    position: Position
    role?: TacticalRole
    duty?: TacticalRole
    energy: number
    form?: number
  }[],
  posture: Posture,
): Sectors {
  const totals: Sectors = { defense: 0, midfield: 0, attack: 0 }
  for (const slot of onPitch) {
    const { player, position, energy, form } = slot
    const shape = matchShape(player, position, energy, form) * dutyFactor(player, slot)
    const skills = sectorSkills(player, position)
    const weights = ROLE_SECTORS[roleOf(slot)]
    for (const sector of SECTORS) totals[sector] += weights[sector] * skills[sector] * shape
  }
  const effect = POSTURE_EFFECT[posture]
  return {
    defense: (totals.defense / NORMALIZER.defense) * effect.defense,
    midfield: totals.midfield / NORMALIZER.midfield,
    attack: (totals.attack / NORMALIZER.attack) * effect.attack,
  }
}
