import type { Attribute, Attributes, Player, PlayStyle, Position } from '../model/types.ts'
import type { Rng } from '../rng.ts'

/** The six numbers on the face of an outfield card. */
export type Face = 'RIT' | 'FIN' | 'PAS' | 'DRI' | 'DEF' | 'FIS'
/** The six numbers on the face of a goalkeeper's card. */
export type KeeperFace = 'ELA' | 'MAO' | 'REP' | 'REF' | 'VEL' | 'POS'
export type AnyFace = Face | KeeperFace

export const FACES: readonly Face[] = ['RIT', 'FIN', 'PAS', 'DRI', 'DEF', 'FIS']
export const KEEPER_FACES: readonly KeeperFace[] = ['ELA', 'MAO', 'REP', 'REF', 'VEL', 'POS']

/** Which attributes make up each face number, and how much each one counts. */
export const FACE_PARTS: Record<AnyFace, Partial<Record<Attribute, number>>> = {
  RIT: { acceleration: 0.5, sprintSpeed: 0.5 },
  FIN: { finishing: 0.45, shotPower: 0.2, attackPositioning: 0.25, penalties: 0.1 },
  PAS: { shortPassing: 0.35, longPassing: 0.2, vision: 0.3, crossing: 0.15 },
  DRI: { dribbling: 0.4, ballControl: 0.35, agility: 0.25 },
  DEF: { marking: 0.3, tackling: 0.3, interceptions: 0.25, heading: 0.15 },
  FIS: { strength: 0.3, stamina: 0.3, jumping: 0.2, aggression: 0.2 },
  ELA: { diving: 1 },
  MAO: { handling: 1 },
  REP: { kicking: 1 },
  REF: { reflexes: 1 },
  VEL: { acceleration: 0.5, sprintSpeed: 0.5 },
  POS: { keeperPositioning: 1 },
}

export const ATTRIBUTES = [
  'acceleration',
  'sprintSpeed',
  'finishing',
  'shotPower',
  'attackPositioning',
  'penalties',
  'shortPassing',
  'longPassing',
  'vision',
  'crossing',
  'dribbling',
  'ballControl',
  'agility',
  'marking',
  'tackling',
  'interceptions',
  'heading',
  'strength',
  'stamina',
  'jumping',
  'aggression',
  'diving',
  'handling',
  'kicking',
  'reflexes',
  'keeperPositioning',
] as const satisfies readonly Attribute[]

/** The attributes under each face, in the order the details drawer lists them. */
export const FACE_ATTRIBUTES = Object.fromEntries(
  Object.entries(FACE_PARTS).map(([face, parts]) => [face, Object.keys(parts)]),
) as Record<AnyFace, Attribute[]>

export function faceValue(attributes: Attributes, face: AnyFace): number {
  let total = 0
  for (const [attribute, weight] of Object.entries(FACE_PARTS[face])) {
    total += attributes[attribute as Attribute] * weight!
  }
  return total
}

/** The six face numbers a card shows, keepers' or outfield. */
export function faces(player: Player): { face: AnyFace; value: number }[] {
  const list = player.position === 'G' ? KEEPER_FACES : FACES
  return list.map((face) => ({ face, value: Math.round(faceValue(player.attributes, face)) }))
}

/** How much each face counts towards the overall in each position. */
export const OVERALL_WEIGHTS: Record<Position, Partial<Record<AnyFace, number>>> = {
  G: { ELA: 0.21, MAO: 0.21, REF: 0.24, POS: 0.24, REP: 0.07, VEL: 0.03 },
  Z: { DEF: 0.55, FIS: 0.25, RIT: 0.1, PAS: 0.1 },
  L: { DEF: 0.35, RIT: 0.25, PAS: 0.2, FIS: 0.1, DRI: 0.1 },
  M: { PAS: 0.4, DRI: 0.25, DEF: 0.1, FIN: 0.1, FIS: 0.1, RIT: 0.05 },
  A: { FIN: 0.45, RIT: 0.2, DRI: 0.2, FIS: 0.1, PAS: 0.05 },
}

/** Overall in a position before rounding. */
function rawOverall(attributes: Attributes, position: Position): number {
  let total = 0
  for (const [face, weight] of Object.entries(OVERALL_WEIGHTS[position])) {
    total += faceValue(attributes, face as AnyFace) * weight!
  }
  return total
}

/** What the attributes are worth in a position, 1 to 99. */
export const overallAt = (attributes: Attributes, position: Position): number =>
  Math.min(99, Math.max(1, Math.round(rawOverall(attributes, position))))

/** Each style's key attributes: generating a player with it raises them, and their average decides the "+". */
export const STYLE_ATTRIBUTES: Record<PlayStyle, Attribute[]> = {
  paredao: ['reflexes', 'diving'],
  colocacao: ['keeperPositioning', 'handling'],
  saida: ['kicking', 'acceleration'],
  muralha: ['marking', 'strength'],
  desarmador: ['tackling', 'interceptions'],
  cabeceador: ['heading', 'jumping'],
  cruzador: ['crossing', 'longPassing'],
  velocista: ['acceleration', 'sprintSpeed'],
  passador: ['shortPassing', 'ballControl'],
  armador: ['vision', 'longPassing'],
  driblador: ['dribbling', 'agility'],
  finalizador: ['finishing', 'attackPositioning'],
}

export const STYLES_BY_POSITION: Record<Position, readonly PlayStyle[]> = {
  G: ['paredao', 'colocacao', 'saida'],
  Z: ['muralha', 'desarmador', 'cabeceador', 'velocista'],
  L: ['muralha', 'cruzador', 'velocista', 'passador'],
  M: ['passador', 'armador', 'desarmador', 'driblador', 'finalizador'],
  A: ['finalizador', 'driblador', 'cabeceador', 'velocista'],
}

/** Key attributes averaging this much give the "+" version of a style. */
export const STYLE_PLUS_FROM = 84

/** 0 without the style, 1 with it, 2 with its "+" version. */
export function styleLevel(player: Player, style: PlayStyle): 0 | 1 | 2 {
  if (!player.styles.includes(style)) return 0
  const keys = STYLE_ATTRIBUTES[style]
  const average = keys.reduce((sum, key) => sum + player.attributes[key], 0) / keys.length
  return average >= STYLE_PLUS_FROM ? 2 : 1
}

/**
 * Typical shape of each position, as face numbers above or below the overall.
 * A centre-back is all defending and body; a striker finishes and runs.
 */
const PROFILE: Record<Position, Record<AnyFace, number>> = {
  G: {
    ELA: 0,
    MAO: 0,
    REF: 1,
    POS: 0,
    REP: -6,
    VEL: -14,
    FIN: -45,
    PAS: -30,
    DRI: -35,
    DEF: -35,
    FIS: -14,
    RIT: -14,
  },
  Z: {
    DEF: 3,
    FIS: 2,
    RIT: -8,
    PAS: -10,
    DRI: -15,
    FIN: -25,
    ELA: -45,
    MAO: -45,
    REP: -40,
    REF: -45,
    VEL: -8,
    POS: -45,
  },
  L: {
    DEF: 0,
    RIT: 3,
    PAS: -2,
    FIS: -5,
    DRI: -5,
    FIN: -18,
    ELA: -45,
    MAO: -45,
    REP: -40,
    REF: -45,
    VEL: 3,
    POS: -45,
  },
  M: {
    PAS: 3,
    DRI: 0,
    DEF: -10,
    FIN: -6,
    FIS: -6,
    RIT: -5,
    ELA: -45,
    MAO: -45,
    REP: -40,
    REF: -45,
    VEL: -5,
    POS: -45,
  },
  A: {
    FIN: 3,
    RIT: 0,
    DRI: 0,
    FIS: -5,
    PAS: -10,
    DEF: -30,
    ELA: -45,
    MAO: -45,
    REP: -40,
    REF: -45,
    VEL: 0,
    POS: -45,
  },
}

/** Attributes that stray from their face in a position: strikers head the ball, full-backs cross. */
const TWEAKS: Partial<Record<Position, Partial<Record<Attribute, number>>>> = {
  Z: { heading: 4, aggression: 4 },
  L: { crossing: 6, stamina: 5 },
  M: { stamina: 6, vision: 2 },
  A: { heading: 20, shotPower: 3, strength: 3, aggression: -4 },
  G: { strength: 10, jumping: 10 },
}

/** Points a style adds to its key attributes when a player is generated. */
const STYLE_BOOST = 8

const clampAttribute = (value: number) => Math.min(99, Math.max(1, Math.round(value)))

/**
 * Attributes for a player of a given overall: the position's usual shape, some
 * personality, the styles' key skills raised, then all shifted together so
 * the overall comes out at the target (give or take one at the extremes).
 */
export function generateAttributes(
  rng: Rng,
  position: Position,
  overall: number,
  styles: readonly PlayStyle[],
): Attributes {
  const values = {} as Record<Attribute, number>
  const faceNoise = Object.fromEntries(
    [...FACES, ...KEEPER_FACES].map((face) => [face, rng.normal(0, 4)]),
  ) as Record<AnyFace, number>
  for (const attribute of ATTRIBUTES) {
    // Pace sits under both RIT and VEL; the outfield face decides it.
    const face = (Object.keys(FACE_PARTS) as AnyFace[]).find(
      (f) => f !== 'VEL' && FACE_PARTS[f][attribute] !== undefined,
    )!
    values[attribute] =
      overall +
      PROFILE[position][face] +
      (TWEAKS[position]?.[attribute] ?? 0) +
      faceNoise[face] +
      rng.normal(0, 3)
  }
  for (const style of styles) {
    for (const attribute of STYLE_ATTRIBUTES[style]) values[attribute] += STYLE_BOOST
  }
  return fitOverall(values, position, overall)
}

/** Shifts every attribute by the same amount until the overall in `position` hits `target`. */
export function fitOverall(
  values: Record<Attribute, number>,
  position: Position,
  target: number,
): Attributes {
  let attributes = Object.fromEntries(
    ATTRIBUTES.map((a) => [a, clampAttribute(values[a])]),
  ) as Attributes
  let shift = 0
  for (let i = 0; i < 4; i++) {
    const gap = target - rawOverall(attributes, position)
    if (Math.abs(gap) < 0.5) break
    shift += gap
    attributes = Object.fromEntries(
      ATTRIBUTES.map((a) => [a, clampAttribute(values[a] + shift)]),
    ) as Attributes
  }
  return attributes
}

/** Positions next to each one, where a player may also be at home. */
const NEIGHBOURS: Record<Position, Position[]> = {
  G: [],
  Z: ['L'],
  L: ['Z', 'M'],
  M: ['L', 'A'],
  A: ['M'],
}

/** A neighbouring position counts as his too when his overall there is this close. */
const SECONDARY_WITHIN = 4

export function secondaryPositions(attributes: Attributes, position: Position): Position[] {
  const own = rawOverall(attributes, position)
  return NEIGHBOURS[position].filter(
    (other) => rawOverall(attributes, other) >= own - SECONDARY_WITHIN,
  )
}

/** Strong players stand out in a style or two; weak ones in one at most. */
export function pickStyles(rng: Rng, position: Position, overall: number): PlayStyle[] {
  const count = overall >= 70 ? 2 : overall >= 50 ? rng.int(1, 2) : rng.int(0, 1)
  return rng.shuffle(STYLES_BY_POSITION[position]).slice(0, count)
}

/** About one in five is left-footed; most have an average weaker foot. */
export function pickFeet(rng: Rng): Pick<Player, 'foot' | 'weakFoot'> {
  const roll = rng.next()
  const weakFoot = roll < 0.06 ? 1 : roll < 0.32 ? 2 : roll < 0.78 ? 3 : roll < 0.95 ? 4 : 5
  return { foot: rng.next() < 0.22 ? 'esquerdo' : 'direito', weakFoot }
}
