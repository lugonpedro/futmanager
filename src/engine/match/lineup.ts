import type { Formation, Lineup, LineupSlot, Player, Position, Posture } from '../model/types.ts'
import { positionFit } from './strength.ts'

/** How many players each formation puts in each position. Laterais count as defenders. */
export const FORMATIONS: Record<Formation, Record<Position, number>> = {
  '4-4-2': { G: 1, Z: 2, L: 2, M: 4, A: 2 },
  '4-3-3': { G: 1, Z: 2, L: 2, M: 3, A: 3 },
  '3-5-2': { G: 1, Z: 3, L: 0, M: 5, A: 2 },
  '4-5-1': { G: 1, Z: 2, L: 2, M: 5, A: 1 },
  '5-3-2': { G: 1, Z: 3, L: 2, M: 3, A: 2 },
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
    .sort((a, b) => b.strength - a.strength)
  const used = new Set<string>()
  const starters: LineupSlot[] = []

  for (const position of FILL_ORDER) {
    for (let i = 0; i < FORMATIONS[formation][position]; i++) {
      const player =
        COVER[position]
          .map((cover) => available.find((p) => p.position === cover && !used.has(p.id)))
          .find(Boolean) ??
        // Nobody fits: anyone left will do, rather than playing a man short.
        available.find((p) => !used.has(p.id) && p.position !== 'G')
      if (!player) continue
      used.add(player.id)
      starters.push({ playerId: player.id, position })
    }
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

/** The formation's slots, one entry per player, scarce positions first. */
export function formationSlots(formation: Formation): Position[] {
  return FILL_ORDER.flatMap((position) =>
    Array<Position>(FORMATIONS[formation][position]).fill(position),
  )
}

/** Natural position first, then strength: a centre-back beats a stronger midfielder at the back. */
const slotScore = (player: Player, position: Position) =>
  positionFit(player, position) * 1000 + player.strength

function bestFor(candidates: readonly Player[], position: Position): Player | undefined {
  let best: Player | undefined
  for (const player of candidates) {
    if (!best || slotScore(player, position) > slotScore(best, position)) best = player
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
export function fillSlots(players: readonly Player[], slots: readonly Position[]): LineupSlot[] {
  const left = [...players]
  const starters: LineupSlot[] = []
  for (const position of slots) {
    const player = bestFor(left, position)
    if (!player) break
    left.splice(left.indexOf(player), 1)
    starters.push({ playerId: player.id, position })
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

  const kept = lineup.starters.filter((slot) => keep(slot.playerId))
  let bench = lineup.bench.filter(keep)
  const open = [...formationSlots(lineup.formation)]
  for (const slot of kept) {
    const index = open.indexOf(slot.position)
    if (index >= 0) open.splice(index, 1)
  }

  const starters = [...kept]
  const picked = new Set(kept.map((slot) => slot.playerId))
  for (const position of open.slice(0, Math.max(0, 11 - kept.length))) {
    const player = bestFor(
      available.filter((p) => !picked.has(p.id)),
      position,
    )
    if (!player) continue
    picked.add(player.id)
    used.add(player.id)
    bench = bench.filter((id) => id !== player.id)
    starters.push({ playerId: player.id, position })
  }

  const rest = available
    .filter((player) => !used.has(player.id))
    .sort((a, b) => b.strength - a.strength)
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
        sum + byId.get(playerId)!.strength * positionFit(byId.get(playerId)!, position),
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
