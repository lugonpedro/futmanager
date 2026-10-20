import { FREE_AGENT, type GameState, type Player, type Position } from '../engine/model/types.ts'
import { careerGames, potentialRange } from '../engine/progression/progression.ts'
import { askingPrice, canLeave, wageDemand } from '../engine/transfer/market.ts'

export const SITUATIONS = ['Todos', 'Sem clube', 'Contrato no fim', 'Favoritos'] as const
export type Situation = (typeof SITUATIONS)[number]

/** Age bands, youngest and oldest included. */
export const AGES = {
  Todas: [0, 99],
  'Até 21': [0, 21],
  '22 a 29': [22, 29],
  '30 ou mais': [30, 99],
} as const
export type AgeBand = keyof typeof AGES

export const MARKET_SORTS = ['Geral', 'Potencial', 'Preço', 'Salário', 'Idade'] as const
export type MarketSort = (typeof MARKET_SORTS)[number]

export type MarketFilters = {
  position: Position | 'Todos'
  situation: Situation
  age: AgeBand
  /** Division of the player's club; undefined for any. */
  division?: number
  minOverall: number
  minPotential: number
  /** Only fees the club's cash covers. */
  affordable: boolean
  sort: MarketSort
  search: string
}

export const NO_FILTERS: MarketFilters = {
  position: 'Todos',
  situation: 'Todos',
  age: 'Todas',
  minOverall: 0,
  minPotential: 0,
  affordable: false,
  sort: 'Geral',
  search: '',
}

/** How many of the filters beyond position, sort and search are on, for the "Filtros" button. */
export function activeFilters(filters: MarketFilters): number {
  return [
    filters.situation !== 'Todos',
    filters.age !== 'Todas',
    filters.division !== undefined,
    filters.minOverall > 0,
    filters.minPotential > 0,
    filters.affordable,
  ].filter(Boolean).length
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
  const query = filters.search.trim().toLocaleLowerCase('pt-BR')
  const [youngest, oldest] = AGES[filters.age]
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
    .filter((p) => filters.position === 'Todos' || p.position === filters.position)
    .filter((p) => !query || p.name.toLocaleLowerCase('pt-BR').includes(query))
    .filter(inSituation)
    .filter((p) => p.age >= youngest && p.age <= oldest)
    .filter(
      (p) => filters.division === undefined || world.clubs[p.clubId]?.division === filters.division,
    )
    .filter((p) => p.overall >= filters.minOverall)
    .filter((p) => canLeave(world, p))
    .map((player) => ({
      player,
      price: askingPrice(game, player),
      wage: wageDemand(world, player, userClubId),
      potential: potentialRange(player, careerGames(player, season.appearances)),
    }))
    .filter((r) => r.potential.high >= filters.minPotential)
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
