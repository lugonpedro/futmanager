import { FREE_AGENT, type GameState, type Player } from '../engine/model/types.ts'
import { careerGames, potentialRange } from '../engine/progression/progression.ts'
import { askingPrice, canLeave, wageDemand } from '../engine/transfer/market.ts'
import {
  activePlayerFilters,
  matchesPlayer,
  NO_PLAYER_FILTERS,
  reachesPotential,
  type PlayerFilters,
} from './playerFilter.ts'

export const SITUATIONS = ['Todos', 'Sem clube', 'Contrato no fim', 'Favoritos'] as const
export type Situation = (typeof SITUATIONS)[number]

export const MARKET_SORTS = ['Geral', 'Potencial', 'Preço', 'Salário', 'Idade'] as const
export type MarketSort = (typeof MARKET_SORTS)[number]

export type MarketFilters = PlayerFilters & {
  situation: Situation
  /** Division of the player's club; undefined for any. */
  division?: number
  /** Only fees the club's cash covers. */
  affordable: boolean
  sort: MarketSort
}

export const NO_FILTERS: MarketFilters = {
  ...NO_PLAYER_FILTERS,
  situation: 'Todos',
  affordable: false,
  sort: 'Geral',
}

/** How many of the filters beyond position, sort and search are on, for the "Filtros" button. */
export function activeFilters(filters: MarketFilters): number {
  return (
    activePlayerFilters(filters) +
    [filters.situation !== 'Todos', filters.division !== undefined, filters.affordable].filter(
      Boolean,
    ).length
  )
}

export type MarketRow = {
  player: Player
  price: number
  /** What he asks to join the user's club. */
  wage: number
  potential: { low: number; high: number }
}

/**
 * The players the user could buy, filtered and sorted. `signableOnly` keeps
 * the ones that can sign today, which with the window shut is the free agents.
 */
export function marketRows(
  game: GameState,
  filters: MarketFilters,
  signableOnly: (player: Player) => boolean = () => true,
): MarketRow[] {
  const { world, userClubId, season } = game
  const cash = world.clubs[userClubId].cash
  const favorites = new Set(game.favorites)
  const inSituation = (p: Player) => {
    if (filters.situation === 'Sem clube') return p.clubId === FREE_AGENT
    if (filters.situation === 'Contrato no fim')
      return p.clubId !== FREE_AGENT && p.contractUntil <= season.year
    if (filters.situation === 'Favoritos') return favorites.has(p.id)
    return true
  }

  const rows = Object.values(world.players)
    .filter((p) => p.clubId !== userClubId)
    .filter(signableOnly)
    .filter((p) => matchesPlayer(p, filters))
    .filter(inSituation)
    .filter(
      (p) => filters.division === undefined || world.clubs[p.clubId]?.division === filters.division,
    )
    .filter((p) => canLeave(world, p))
    .map((player) => ({
      player,
      price: askingPrice(game, player),
      wage: wageDemand(world, player, userClubId),
      potential: potentialRange(player, careerGames(player, season.appearances)),
    }))
    .filter((r) => reachesPotential(r.potential, filters))
    .filter((r) => !filters.affordable || r.price <= cash)

  const order: Record<MarketSort, (a: MarketRow, b: MarketRow) => number> = {
    Geral: (a, b) => b.player.overall - a.player.overall,
    Potencial: (a, b) => b.potential.high - a.potential.high,
    Preço: (a, b) => a.price - b.price,
    Salário: (a, b) => a.wage - b.wage,
    Idade: (a, b) => a.player.age - b.player.age,
  }
  // Ties go to the strongest first.
  return rows.sort((a, b) => order[filters.sort](a, b) || b.player.overall - a.player.overall)
}
