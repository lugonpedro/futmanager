import type { Player, Position } from '../engine/model/types.ts'

/** Age bands, youngest and oldest included. */
export const AGES = {
  Todas: [0, 99],
  'Até 21': [0, 21],
  '22 a 29': [22, 29],
  '30 ou mais': [30, 99],
} as const
export type AgeBand = keyof typeof AGES

/**
 * The filters every player list shares: the career market, and the draft and
 * market of the online rooms. Each list adds its own on top.
 */
export type PlayerFilters = {
  position: Position | 'Todos'
  age: AgeBand
  minOverall: number
  minPotential: number
  search: string
}

export const NO_PLAYER_FILTERS: PlayerFilters = {
  position: 'Todos',
  age: 'Todas',
  minOverall: 0,
  minPotential: 0,
  search: '',
}

/** How many of the shared filters hidden under "Filtros" are on. */
export function activePlayerFilters(filters: PlayerFilters): number {
  return [filters.age !== 'Todas', filters.minOverall > 0, filters.minPotential > 0].filter(Boolean)
    .length
}

/**
 * Whether a player passes the shared filters, but for the minimum potential:
 * lists work the potential out in their own way, and later, since it costs
 * more, so they check it with {@link reachesPotential}.
 */
export function matchesPlayer(player: Player, filters: PlayerFilters): boolean {
  const query = filters.search.trim().toLocaleLowerCase('pt-BR')
  const [youngest, oldest] = AGES[filters.age]
  return (
    (filters.position === 'Todos' || player.position === filters.position) &&
    (!query || player.name.toLocaleLowerCase('pt-BR').includes(query)) &&
    player.age >= youngest &&
    player.age <= oldest &&
    player.overall >= filters.minOverall
  )
}

/** Whether the top of a player's potential range reaches the minimum. */
export function reachesPotential(potential: { high: number }, filters: PlayerFilters): boolean {
  return potential.high >= filters.minPotential
}
