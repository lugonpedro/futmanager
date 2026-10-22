import type { Formation, PlayStyle, Position, TacticalRole } from '../model/types.ts'
import { OVERALL_WEIGHTS, type AnyFace } from '../player/attributes.ts'

/** A slot of a formation: the position it counts as and what it asks of its player. */
export type Slot = { position: Position; role: TacticalRole }

/** The plain role of each position, for slots saved before roles. */
export const DEFAULT_ROLE: Record<Position, TacticalRole> = {
  G: 'GOL',
  Z: 'ZAG',
  L: 'LAT',
  M: 'MC',
  A: 'CA',
}

/** The role a starter plays: the one the user picked, or else his slot's. */
export const roleOf = (slot: {
  position: Position
  role?: TacticalRole
  duty?: TacticalRole
}): TacticalRole => slot.duty ?? slot.role ?? DEFAULT_ROLE[slot.position]

/**
 * How much each face counts towards a player's level in a role. The plain
 * roles weigh like their position, so a player in his own position and plain
 * role keeps his overall.
 */
export const ROLE_WEIGHTS: Record<TacticalRole, Partial<Record<AnyFace, number>>> = {
  GOL: OVERALL_WEIGHTS.G,
  ZAG: OVERALL_WEIGHTS.Z,
  LAT: OVERALL_WEIGHTS.L,
  ALA: { RIT: 0.25, PAS: 0.25, DEF: 0.25, DRI: 0.15, FIS: 0.1 },
  VOL: { DEF: 0.4, PAS: 0.3, FIS: 0.2, RIT: 0.05, DRI: 0.05 },
  MC: OVERALL_WEIGHTS.M,
  MEI: { PAS: 0.4, DRI: 0.3, FIN: 0.2, RIT: 0.05, FIS: 0.05 },
  ME: { PAS: 0.3, DRI: 0.3, RIT: 0.15, FIN: 0.1, FIS: 0.1, DEF: 0.05 },
  MD: { PAS: 0.3, DRI: 0.3, RIT: 0.15, FIN: 0.1, FIS: 0.1, DEF: 0.05 },
  PE: { RIT: 0.3, DRI: 0.35, FIN: 0.2, PAS: 0.1, FIS: 0.05 },
  PD: { RIT: 0.3, DRI: 0.35, FIN: 0.2, PAS: 0.1, FIS: 0.05 },
  CA: OVERALL_WEIGHTS.A,
  SA: { FIN: 0.35, DRI: 0.25, PAS: 0.2, RIT: 0.15, FIS: 0.05 },
  AO: { RIT: 0.3, PAS: 0.25, DRI: 0.2, DEF: 0.15, FIS: 0.1 },
  LI: { PAS: 0.35, DEF: 0.3, DRI: 0.15, RIT: 0.1, FIS: 0.1 },
  REG: { PAS: 0.6, DRI: 0.15, DEF: 0.15, FIS: 0.1 },
  AS: { FIN: 0.4, DRI: 0.25, RIT: 0.2, PAS: 0.1, FIS: 0.05 },
  CPD: { DRI: 0.35, FIN: 0.3, RIT: 0.25, PAS: 0.1 },
  F9: { PAS: 0.35, DRI: 0.3, FIN: 0.25, RIT: 0.1 },
}

/**
 * How much a player in each role adds to defence, midfield and attack. The
 * plain roles add what their position always did; the others lean one way:
 * a volante shields the back line, a meia ofensivo and the pontas push up.
 */
export const ROLE_SECTORS: Record<
  TacticalRole,
  { defense: number; midfield: number; attack: number }
> = {
  GOL: { defense: 1.5, midfield: 0, attack: 0 },
  ZAG: { defense: 1, midfield: 0.2, attack: 0.1 },
  LAT: { defense: 0.7, midfield: 0.5, attack: 0.3 },
  ALA: { defense: 0.35, midfield: 0.85, attack: 0.45 },
  VOL: { defense: 0.45, midfield: 0.9, attack: 0.35 },
  MC: { defense: 0.25, midfield: 1, attack: 0.5 },
  MEI: { defense: 0.05, midfield: 0.9, attack: 1 },
  ME: { defense: 0.2, midfield: 0.95, attack: 0.55 },
  MD: { defense: 0.2, midfield: 0.95, attack: 0.55 },
  PE: { defense: 0, midfield: 0.35, attack: 1 },
  PD: { defense: 0, midfield: 0.35, attack: 1 },
  CA: { defense: 0, midfield: 0.3, attack: 1 },
  SA: { defense: 0, midfield: 0.45, attack: 0.95 },
  AO: { defense: 0.5, midfield: 0.5, attack: 0.45 },
  LI: { defense: 0.6, midfield: 0.8, attack: 0.2 },
  REG: { defense: 0.3, midfield: 1.1, attack: 0.4 },
  AS: { defense: 0, midfield: 0.5, attack: 0.9 },
  CPD: { defense: 0, midfield: 0.3, attack: 1.05 },
  F9: { defense: 0, midfield: 0.75, attack: 0.75 },
}

/** How often a role ends up shooting, against the plain role of its position. */
export const ROLE_SHOOTING: Partial<Record<TacticalRole, number>> = {
  VOL: 0.5,
  MEI: 1.5,
  ME: 1.1,
  MD: 1.1,
  ALA: 1.2,
  PE: 0.85,
  PD: 0.85,
  SA: 0.85,
  AO: 1.6,
  LI: 1.2,
  REG: 0.45,
  AS: 1.9,
  CPD: 1,
  F9: 0.6,
}

/** The position each role belongs to, which its shooting above is measured against. */
export const ROLE_HOME: Record<TacticalRole, Position> = {
  GOL: 'G',
  ZAG: 'Z',
  LAT: 'L',
  AO: 'L',
  LI: 'L',
  ALA: 'M',
  VOL: 'M',
  REG: 'M',
  MC: 'M',
  MEI: 'M',
  AS: 'M',
  ME: 'M',
  MD: 'M',
  PE: 'A',
  PD: 'A',
  CPD: 'A',
  CA: 'A',
  F9: 'A',
  SA: 'A',
}

/**
 * What a picked role does beyond its sectors and shooting: `crosses` adds to
 * the side's balls into the box (in style points), `aerial` scales how often
 * he is the one on the end of them, `pulls` takes points off the defence he
 * attacks and `counter` adds to the side's counter-attacks.
 */
export const ROLE_TRAITS: Partial<
  Record<TacticalRole, { crosses?: number; aerial?: number; pulls?: number; counter?: number }>
> = {
  AO: { crosses: 3 },
  LI: { crosses: -2 },
  REG: { counter: 1.5 },
  CPD: { crosses: -3 },
  F9: { aerial: 0.4, pulls: 1.5 },
}

/** Styles that suit a picked role: each level of them makes him a little better in it. */
export const ROLE_STYLES: Partial<Record<TacticalRole, PlayStyle[]>> = {
  AO: ['cruzador', 'incansavel'],
  LI: ['passador'],
  REG: ['lancador', 'armador'],
  AS: ['finalizador', 'chutador'],
  CPD: ['chutador', 'driblador'],
  F9: ['passador', 'driblador'],
}

/** The wing a slot's role stands on, for the roles that stand on one. */
export function sideOf(role: TacticalRole | undefined): 'esquerda' | 'direita' | undefined {
  if (role === 'PE' || role === 'ME') return 'esquerda'
  if (role === 'PD' || role === 'MD') return 'direita'
  return undefined
}

/**
 * The roles the user may pick for a slot of each position: any of its part of
 * the pitch (goal, defence, midfield or attack), the plain one first.
 */
export const DUTIES_BY_POSITION: Record<Position, TacticalRole[]> = {
  G: ['GOL'],
  Z: ['ZAG', 'LAT', 'AO', 'LI'],
  L: ['LAT', 'AO', 'LI', 'ZAG'],
  M: ['MC', 'VOL', 'REG', 'MEI', 'AS', 'ME', 'MD', 'ALA', 'CPD'],
  A: ['CA', 'F9', 'SA', 'AS', 'PE', 'PD', 'CPD'],
}

/**
 * The roles on offer for a slot: those of its position, without the ones
 * that stand on the other wing. A central slot may drift to either wing.
 */
export function dutiesFor(slot: { position: Position; role?: TacticalRole }): TacticalRole[] {
  const side = sideOf(slot.role)
  return (DUTIES_BY_POSITION[slot.position] ?? []).filter((duty) => {
    const dutySide = sideOf(duty)
    return dutySide === undefined || side === undefined || dutySide === side
  })
}

const g = { position: 'G', role: 'GOL' } as const
const z = { position: 'Z', role: 'ZAG' } as const
const lat = { position: 'L', role: 'LAT' } as const
const ala = { position: 'M', role: 'ALA' } as const
const vol = { position: 'M', role: 'VOL' } as const
const mc = { position: 'M', role: 'MC' } as const
const mei = { position: 'M', role: 'MEI' } as const
const me = { position: 'M', role: 'ME' } as const
const md = { position: 'M', role: 'MD' } as const
const pe = { position: 'A', role: 'PE' } as const
const pd = { position: 'A', role: 'PD' } as const
const ca = { position: 'A', role: 'CA' } as const
const sa = { position: 'A', role: 'SA' } as const

/**
 * Every formation as lines of slots, from the keeper forwards, each line from
 * left to right. Their positions add up to the counts in FORMATIONS.
 */
export const FORMATION_LINES: Record<Formation, Slot[][]> = {
  '4-4-2': [[g], [lat, z, z, lat], [me, mc, mc, md], [ca, ca]],
  '4-3-3': [[g], [lat, z, z, lat], [vol], [mc, mc], [pe, ca, pd]],
  '3-5-2': [[g], [z, z, z], [ala, vol, mc, ala], [mei], [ca, sa]],
  '4-5-1': [[g], [lat, z, z, lat], [me, mc, mc, mc, md], [ca]],
  '5-3-2': [[g], [lat, z, z, z, lat], [mc, vol, mc], [ca, sa]],
  '3-4-3': [[g], [z, z, z], [ala, mc, mc, ala], [pe, ca, pd]],
  '4-2-4': [[g], [lat, z, z, lat], [mc, mc], [pe, ca, ca, pd]],
  '5-4-1': [[g], [lat, z, z, z, lat], [me, vol, mc, md], [ca]],
  '4-1-4-1': [[g], [lat, z, z, lat], [vol], [me, mc, mc, md], [ca]],
  '4-2-3-1': [[g], [lat, z, z, lat], [vol, vol], [me, mei, md], [ca]],
}

/** The roles each position plays in some formation, the plain one first. */
export const ROLES_BY_POSITION = Object.fromEntries(
  (Object.keys(DEFAULT_ROLE) as Position[]).map((position) => [
    position,
    [
      ...new Set([
        DEFAULT_ROLE[position],
        ...Object.values(FORMATION_LINES)
          .flat(2)
          .filter((slot) => slot.position === position)
          .map((slot) => slot.role),
      ]),
    ],
  ]),
) as Record<Position, TacticalRole[]>
