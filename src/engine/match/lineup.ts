import type {
  Formation,
  Lineup,
  LineupSlot,
  Player,
  Position,
  Posture,
  TacticalRole,
} from '../model/types.ts'
import { DEFAULT_ROLE, FORMATION_LINES, roleOf, type Slot } from './roles.ts'
import { positionFit, roleOverall } from './strength.ts'

/** How many players each formation puts in each position. Laterais count as defenders. */
export const FORMATIONS = Object.fromEntries(
  Object.entries(FORMATION_LINES).map(([formation, lines]) => {
    const counts: Record<Position, number> = { G: 0, Z: 0, L: 0, M: 0, A: 0 }
    for (const slot of lines.flat()) counts[slot.position]++
    return [formation, counts]
  }),
) as Record<Formation, Record<Position, number>>

/**
 * The XI by line, from the keeper forwards, each player in the slot of the
 * formation that matches his position and role, or failing that his position.
 * Anyone left over (a keeper sent off and replaced by an outfield player) joins
 * the last line of his position, so nobody ever goes missing.
 */
export function formationLines<T extends { position: Position; role?: TacticalRole }>(
  starters: readonly T[],
  formation: Formation,
): T[][] {
  const lines = FORMATION_LINES[formation]
  const left = [...starters]
  const take = (match: (s: T) => boolean) => {
    const index = left.findIndex(match)
    return index < 0 ? undefined : left.splice(index, 1)[0]
  }
  const placed = lines.map((line) =>
    line.map((slot) => take((s) => s.position === slot.position && s.role === slot.role)),
  )
  lines.forEach((line, i) =>
    line.forEach((slot, j) => {
      placed[i][j] ??= take((s) => s.position === slot.position)
    }),
  )
  const result = placed.map((line) => line.filter((s): s is T => s !== undefined))
  for (const extra of left) {
    const at = lines.findLastIndex((line) => line.some((slot) => slot.position === extra.position))
    result[at < 0 ? result.length - 1 : at].push(extra)
  }
  return result.filter((line) => line.length > 0)
}

/**
 * Gives a lineup saved before roles the roles of its formation: within each
 * position, in the order the starters were saved, from the back and the left.
 */
export function withRoles(lineup: Lineup): Lineup {
  if (lineup.starters.every((slot) => slot.role)) return lineup
  const roles = Object.fromEntries(
    (Object.keys(DEFAULT_ROLE) as Position[]).map((position) => [
      position,
      FORMATION_LINES[lineup.formation]
        .flat()
        .filter((slot) => slot.position === position)
        .map((slot) => slot.role),
    ]),
  ) as Record<Position, TacticalRole[]>
  const starters = lineup.starters.map((slot) => ({
    ...slot,
    role: slot.role ?? roles[slot.position].shift() ?? DEFAULT_ROLE[slot.position],
  }))
  return { ...lineup, starters }
}

export const BENCH_SIZE = 7

/** Order to fill positions in, scarce ones first, and who can cover each one. */
const FILL_ORDER: Position[] = ['G', 'Z', 'L', 'A', 'M']
const COVER: Record<Position, Position[]> = {
  G: ['G'],
  Z: ['Z', 'L', 'M'],
  L: ['L', 'Z', 'M'],
  M: ['M', 'L', 'A'],
  A: ['A', 'M'],
}

/**
 * Picks the strongest available players for a formation, covering a missing
 * position with the closest one. Bench gets a keeper plus the best of the rest.
 */
export function autoLineup(
  squad: readonly Player[],
  formation: Formation = '4-4-2',
  posture: Posture = 'normal',
  unavailable: ReadonlySet<string> = new Set(),
): Lineup {
  const available = squad
    .filter((player) => !unavailable.has(player.id))
    .sort((a, b) => b.overall - a.overall)
  const used = new Set<string>()
  const starters: LineupSlot[] = []

  for (const position of FILL_ORDER) {
    const group: Player[] = []
    for (let i = 0; i < FORMATIONS[formation][position]; i++) {
      const player =
        COVER[position]
          .map((cover) => available.find((p) => p.position === cover && !used.has(p.id)))
          .find(Boolean) ??
        // Nobody fits: anyone left will do, rather than playing a man short.
        available.find((p) => !used.has(p.id) && p.position !== 'G')
      if (!player) continue
      used.add(player.id)
      group.push(player)
    }
    // Who plays is settled by position; the roles go to whoever suits them best.
    starters.push(
      ...fillSlots(
        group,
        formationSlots(formation).filter((slot) => slot.position === position),
      ),
    )
  }

  const rest = available.filter((player) => !used.has(player.id))
  const reserveKeeper = rest.find((player) => player.position === 'G')
  const bench = [
    ...(reserveKeeper ? [reserveKeeper] : []),
    ...rest.filter((player) => player !== reserveKeeper),
  ]
    .slice(0, BENCH_SIZE)
    .map((player) => player.id)

  return { formation, posture, starters, bench }
}

/** Formations in the order the AI prefers them when two are just as good. */
export const FORMATION_LIST = Object.keys(FORMATIONS) as Formation[]

/**
 * The formation's slots, one entry per player: scarce positions first and,
 * within a position, the roles that ask something particular before the plain ones.
 */
export function formationSlots(formation: Formation): Slot[] {
  const slots = FORMATION_LINES[formation].flat()
  return FILL_ORDER.flatMap((position) => {
    const here = slots.filter((slot) => slot.position === position)
    return [
      ...here.filter((slot) => slot.role !== DEFAULT_ROLE[position]),
      ...here.filter((slot) => slot.role === DEFAULT_ROLE[position]),
    ]
  })
}

/**
 * Natural position first, then how good he is in the role: a centre-back beats
 * a stronger midfielder at the back, and the best tackler of the midfielders
 * is the volante.
 */
const slotScore = (player: Player, slot: Slot) =>
  positionFit(player, slot.position) * 1000 + roleOverall(player, slot.role)

function bestFor(candidates: readonly Player[], slot: Slot): Player | undefined {
  let best: Player | undefined
  for (const player of candidates) {
    if (!best || slotScore(player, slot) > slotScore(best, slot)) best = player
  }
  return best
}

/**
 * Puts the given starters into a formation's slots, each where they fit best.
 * Used when the formation changes, so nobody is dropped, only moved.
 */
export function arrangeStarters(players: readonly Player[], formation: Formation): LineupSlot[] {
  return fillSlots(players, formationSlots(formation))
}

/** Fills slots in order, each with the player left who fits it best. */
export function fillSlots(players: readonly Player[], slots: readonly Slot[]): LineupSlot[] {
  const left = [...players]
  const starters: LineupSlot[] = []
  for (const slot of slots) {
    const player = bestFor(left, slot)
    if (!player) break
    left.splice(left.indexOf(player), 1)
    starters.push({ playerId: player.id, position: slot.position, role: slot.role })
  }
  return starters
}

export function changeFormation(
  lineup: Lineup,
  formation: Formation,
  players: Readonly<Record<string, Player>>,
): Lineup {
  const starters = lineup.starters.map((slot) => players[slot.playerId])
  return { ...lineup, formation, starters: arrangeStarters(starters, formation) }
}

/**
 * Gives a starter's slot the role the user picked, or back its own when the
 * pick is the slot's role. The role stays with the slot when players swap.
 */
export function setDuty(lineup: Lineup, playerId: string, duty: TacticalRole): Lineup {
  return {
    ...lineup,
    starters: lineup.starters.map((slot) => {
      if (slot.playerId !== playerId) return slot
      const { duty: _, ...rest } = slot
      return duty === roleOf(rest) ? rest : { ...rest, duty }
    }),
  }
}

/**
 * Swaps two players of the squad. Two starters trade places on the pitch; a
 * starter and anyone else trade the starter's slot for the other's place on the
 * bench or in the stands; two bench players swap order.
 */
export function swapPlayers(lineup: Lineup, aId: string, bId: string): Lineup {
  if (aId === bId) return lineup
  const swap = (id: string) => (id === aId ? bId : id === bId ? aId : id)
  return {
    ...lineup,
    starters: lineup.starters.map((slot) => ({ ...slot, playerId: swap(slot.playerId) })),
    bench: lineup.bench.map(swap),
  }
}

/**
 * Makes a saved lineup playable: drops players who left the club or can't play,
 * fills their slots with whoever fits best (bench first in line, like anyone
 * else) and tops the bench back up, a keeper first.
 */
export function repairLineup(
  lineup: Lineup,
  squad: readonly Player[],
  unavailable: ReadonlySet<string> = new Set(),
): Lineup {
  const available = squad.filter((player) => !unavailable.has(player.id))
  const byId = new Map(available.map((player) => [player.id, player]))
  const used = new Set<string>()
  const keep = (id: string) => {
    if (!byId.has(id) || used.has(id)) return false
    used.add(id)
    return true
  }

  const kept = withRoles(lineup).starters.filter((slot) => keep(slot.playerId))
  let bench = lineup.bench.filter(keep)
  const open = formationSlots(lineup.formation)
  const close = (match: (slot: Slot) => boolean) => {
    const index = open.findIndex(match)
    if (index >= 0) open.splice(index, 1)
    return index >= 0
  }
  for (const slot of kept) {
    if (!close((s) => s.position === slot.position && s.role === slot.role)) {
      close((s) => s.position === slot.position)
    }
  }

  const starters = [...kept]
  const picked = new Set(kept.map((slot) => slot.playerId))
  for (const slot of open.slice(0, Math.max(0, 11 - kept.length))) {
    const player = bestFor(
      available.filter((p) => !picked.has(p.id)),
      slot,
    )
    if (!player) continue
    picked.add(player.id)
    used.add(player.id)
    bench = bench.filter((id) => id !== player.id)
    starters.push({ playerId: player.id, position: slot.position, role: slot.role })
  }

  const rest = available
    .filter((player) => !used.has(player.id))
    .sort((a, b) => b.overall - a.overall)
  if (!bench.some((id) => byId.get(id)?.position === 'G')) {
    const keeper = rest.find((player) => player.position === 'G')
    if (keeper && bench.length < BENCH_SIZE) {
      bench.unshift(keeper.id)
      rest.splice(rest.indexOf(keeper), 1)
    }
  }
  bench = [...bench, ...rest.map((p) => p.id)].slice(0, BENCH_SIZE)

  return { ...lineup, starters, bench }
}

/**
 * The AI's pick: the formation whose best XI adds up to the most, with every
 * player weighed by how well they fit their slot. Ties go to the earlier one.
 */
export function autoFormation(
  squad: readonly Player[],
  unavailable: ReadonlySet<string> = new Set(),
): Formation {
  const byId = new Map(squad.map((player) => [player.id, player]))
  const total = (formation: Formation) =>
    autoLineup(squad, formation, 'normal', unavailable).starters.reduce(
      (sum, { playerId, position }) =>
        sum + byId.get(playerId)!.overall * positionFit(byId.get(playerId)!, position),
      0,
    )
  let best = FORMATION_LIST[0]
  let bestTotal = total(best)
  for (const formation of FORMATION_LIST.slice(1)) {
    const value = total(formation)
    if (value > bestTotal) {
      best = formation
      bestTotal = value
    }
  }
  return best
}
