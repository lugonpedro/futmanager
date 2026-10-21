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

/** Each style's key attributes: their average decides whether a player has it, and the "+". */
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
  chutador: ['shotPower', 'ballControl'],
  cobrador: ['penalties', 'crossing'],
  incansavel: ['stamina'],
  trator: ['strength', 'aggression'],
  lancador: ['vision', 'shortPassing'],
}

/** The styles a player of each position can have. */
export const STYLES_BY_POSITION: Record<Position, readonly PlayStyle[]> = {
  G: ['paredao', 'colocacao', 'saida'],
  Z: ['muralha', 'desarmador', 'cabeceador', 'velocista', 'trator', 'lancador'],
  L: ['muralha', 'cruzador', 'velocista', 'passador', 'incansavel', 'cobrador'],
  M: [
    'passador',
    'armador',
    'desarmador',
    'driblador',
    'finalizador',
    'chutador',
    'lancador',
    'incansavel',
    'trator',
    'cobrador',
  ],
  A: ['finalizador', 'driblador', 'cabeceador', 'velocista', 'chutador', 'trator'],
}

/**
 * The styles a new player may be born gifted at, which raises their key
 * attributes. Kept as they were before styles came from the attributes, so
 * the same seed still makes the same players.
 */
const TALENTS_BY_POSITION: Record<Position, readonly PlayStyle[]> = {
  G: ['paredao', 'colocacao', 'saida'],
  Z: ['muralha', 'desarmador', 'cabeceador', 'velocista'],
  L: ['muralha', 'cruzador', 'velocista', 'passador'],
  M: ['passador', 'armador', 'desarmador', 'driblador', 'finalizador'],
  A: ['finalizador', 'driblador', 'cabeceador', 'velocista'],
}

/** Key attributes averaging this much give the "+" version of a style. */
export const STYLE_PLUS_FROM = 84

/**
 * A player has a style when its key attributes are this much above what is
 * usual for his position and overall, and average at least STYLE_FLOOR.
 */
export const STYLE_MARGIN = 4
export const STYLE_FLOOR = 50
/** Most styles a player picks up; he never loses one he has. */
export const MAX_STYLES = 3

/** 0 without the style, 1 with it, 2 with its "+" version. */
export function styleLevel(player: Player, style: PlayStyle): 0 | 1 | 2 {
  if (!player.styles.includes(style)) return 0
  return keyAverage(player.attributes, style) >= STYLE_PLUS_FROM ? 2 : 1
}

const keyAverage = (attributes: Attributes, style: PlayStyle) =>
  STYLE_ATTRIBUTES[style].reduce((sum, key) => sum + attributes[key], 0) /
  STYLE_ATTRIBUTES[style].length

/** How far a style's key attributes stand above the usual for the position and overall. */
export function styleStandout(attributes: Attributes, position: Position, style: PlayStyle) {
  const overall = rawOverall(attributes, position)
  const keys = STYLE_ATTRIBUTES[style]
  return (
    keys.reduce((sum, key) => sum + attributes[key] - usualAttribute(position, overall, key), 0) /
    keys.length
  )
}

/**
 * Fewest styles a player of this overall has. Near the top of the scale the
 * attributes run into 99 and can hardly stand out from the usual, so the
 * best players get their strongest styles anyway.
 */
export const MIN_STYLES_FROM = { one: 65, two: 80 }
export const minStyles = (overall: number) =>
  overall >= MIN_STYLES_FROM.two ? 2 : overall >= MIN_STYLES_FROM.one ? 1 : 0

/**
 * The styles the attributes earn in a position, the most outstanding first,
 * up to MAX_STYLES: those that stand out, topped up to minStyles with the
 * player's strongest others.
 */
export function earnedStyles(attributes: Attributes, position: Position): PlayStyle[] {
  const ranked = STYLES_BY_POSITION[position]
    .map((style) => ({ style, standout: styleStandout(attributes, position, style) }))
    .filter(({ style }) => keyAverage(attributes, style) >= STYLE_FLOOR)
    .sort((a, b) => b.standout - a.standout)
  const least = minStyles(overallAt(attributes, position))
  return ranked
    .filter(({ standout }, i) => standout >= STYLE_MARGIN || i < least)
    .slice(0, MAX_STYLES)
    .map(({ style }) => style)
}

/** Standout short of STYLE_MARGIN at which a style counts as close. */
const CLOSE_TO_STYLE = 2

/**
 * The style a player is closest to picking up, when he has room for one and
 * is nearly there: what training his key attributes would bring.
 */
export function nextStyle(player: Player): PlayStyle | undefined {
  if (player.styles.length >= MAX_STYLES) return undefined
  let best: { style: PlayStyle; standout: number } | undefined
  for (const style of STYLES_BY_POSITION[player.position]) {
    if (player.styles.includes(style)) continue
    const standout = styleStandout(player.attributes, player.position, style)
    if (standout >= STYLE_MARGIN - CLOSE_TO_STYLE && (!best || standout > best.standout)) {
      best = { style, standout }
    }
  }
  return best?.style
}

/**
 * A player's styles after his attributes moved: he keeps every one he had,
 * and picks up new ones he now stands out in while he has room for them.
 */
export function gainStyles(
  styles: readonly PlayStyle[],
  attributes: Attributes,
  position: Position,
): PlayStyle[] {
  const next = [...styles]
  for (const style of earnedStyles(attributes, position)) {
    if (next.length >= MAX_STYLES) break
    if (!next.includes(style)) next.push(style)
  }
  return next
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

/** The face each attribute is generated from; pace sits under both RIT and VEL, and RIT decides it. */
const ATTRIBUTE_FACE = Object.fromEntries(
  ATTRIBUTES.map((attribute) => [
    attribute,
    (Object.keys(FACE_PARTS) as AnyFace[]).find(
      (f) => f !== 'VEL' && FACE_PARTS[f][attribute] !== undefined,
    )!,
  ]),
) as Record<Attribute, AnyFace>

/** What an attribute usually is for a player of a position and overall. */
const usualAttribute = (position: Position, overall: number, attribute: Attribute) =>
  overall + PROFILE[position][ATTRIBUTE_FACE[attribute]] + (TWEAKS[position]?.[attribute] ?? 0)

/** Points a gifted style adds to its key attributes when a player is generated. */
const STYLE_BOOST = 8

const clampAttribute = (value: number) => Math.min(99, Math.max(1, Math.round(value)))

/**
 * Attributes for a player of a given overall: the position's usual shape, some
 * personality, the gifted styles' key skills raised, then all shifted together so
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
    values[attribute] =
      usualAttribute(position, overall, attribute) +
      faceNoise[ATTRIBUTE_FACE[attribute]] +
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

/** The styles a new player is gifted at: strong players a style or two, weak ones one at most. */
export function pickTalents(rng: Rng, position: Position, overall: number): PlayStyle[] {
  const count = overall >= 70 ? 2 : overall >= 50 ? rng.int(1, 2) : rng.int(0, 1)
  return rng.shuffle(TALENTS_BY_POSITION[position]).slice(0, count)
}

/** About one in five is left-footed; most have an average weaker foot. */
export function pickFeet(rng: Rng): Pick<Player, 'foot' | 'weakFoot'> {
  const roll = rng.next()
  const weakFoot = roll < 0.06 ? 1 : roll < 0.32 ? 2 : roll < 0.78 ? 3 : roll < 0.95 ? 4 : 5
  return { foot: rng.next() < 0.22 ? 'esquerdo' : 'direito', weakFoot }
}
