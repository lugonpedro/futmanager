import type { GameState, TransferOffer } from '../engine/model/types.ts'
import { CUP_NAME, cupWinner } from '../engine/season/cup.ts'
import { transferWindowAt } from '../engine/season/calendar.ts'
import { isSeasonOver, seasonReview, seasonSummary } from '../engine/season/season.ts'
import { divisionName, formatDayMonth, formatMoney } from './format.ts'

export type NewsTone = 'info' | 'success' | 'warning' | 'error'

/** Something that happened while the game moved on, for a toast. */
export type News = {
  tone: NewsTone
  text: string
  /** A page to open about it. */
  link?: { label: string; to: string }
}

/** The confidence below which the board's patience is shown as running out. */
export const SHAKY_CONFIDENCE = 25

const OFFERS = { label: 'Ver proposta', to: '/jogo/mercado/propostas' }
const TEAM = { label: 'Ver time', to: '/jogo/time' }

/**
 * What changed for the user between two moments of the career, most important
 * first: the season's end, the sack, bids for players, money and the board,
 * the transfer window, and players lost for the next games.
 */
export function newsBetween(before: GameState, after: GameState): News[] {
  const news: News[] = []
  const { world, userClubId } = after
  const club = world.clubs[userClubId]
  const squad = new Set(club.playerIds)

  if (!isSeasonOver(before.season) && isSeasonOver(after.season)) {
    news.push(...seasonEnd(after))
  } else if (before.career.status !== 'demitido' && after.career.status === 'demitido') {
    const count = after.career.jobOffers.length
    news.push({
      tone: 'error',
      text: `Você foi demitido do ${before.world.clubs[before.userClubId].name}.${count ? ` ${count} ${count === 1 ? 'clube quer' : 'clubes querem'} você.` : ''}`,
      link: { label: 'Ver propostas de emprego', to: '/jogo' },
    })
  }

  const known = new Set(before.market.offers.map((o) => o.id))
  for (const offer of after.market.offers) {
    if (known.has(offer.id)) continue
    const player = world.players[offer.playerId]
    const listed = before.market.listed[offer.playerId] !== undefined
    news.push({
      tone: 'info',
      text: `${world.clubs[offer.clubId].name} ofereceu ${formatMoney(offer.fee)} por ${player.name}, ${listed ? 'que estava à venda' : 'mesmo sem ele estar à venda'}.`,
      link: OFFERS,
    })
  }

  if (before.world.clubs[before.userClubId].cash >= 0 && club.cash < 0) {
    news.push({
      tone: 'warning',
      text: `O caixa ficou negativo: ${formatMoney(club.cash)}.`,
      link: { label: 'Ver finanças', to: '/jogo/clube/financas' },
    })
  }

  if (
    after.career.status !== 'demitido' &&
    before.career.confidence >= SHAKY_CONFIDENCE &&
    after.career.confidence < SHAKY_CONFIDENCE
  ) {
    news.push({
      tone: 'warning',
      text: `A confiança da diretoria caiu para ${after.career.confidence}%. Se chegar a zero, você é demitido.`,
      link: { label: 'Ver diretoria', to: '/jogo/clube/diretoria' },
    })
  }

  const windowBefore = transferWindowAt(before.today)
  const windowAfter = transferWindowAt(after.today)
  if (windowAfter && windowAfter.from !== windowBefore?.from) {
    news.push({
      tone: 'info',
      text: `${windowAfter.name} aberta até ${formatDayMonth(windowAfter.to)}.`,
      link: { label: 'Ver mercado', to: '/jogo/mercado' },
    })
  } else if (windowBefore && !windowAfter) {
    news.push({ tone: 'info', text: `${windowBefore.name} fechou.` })
  }

  for (const [id, back] of Object.entries(after.season.injuries)) {
    if (!squad.has(id) || before.season.injuries[id] === back) continue
    news.push({
      tone: 'warning',
      text: `${world.players[id].name} se lesionou e só volta em ${formatDayMonth(back)}.`,
      link: TEAM,
    })
  }
  for (const [id, rounds] of Object.entries(after.season.suspensions)) {
    if (!squad.has(id) || (before.season.suspensions[id] ?? 0) >= rounds) continue
    news.push({
      tone: 'warning',
      text: `${world.players[id].name} está suspenso por ${rounds} ${rounds === 1 ? 'rodada' : 'rodadas'}.`,
      link: TEAM,
    })
  }

  // A bid that came in today was announced above, with its lapse date in the Market.
  news.push(...lastDayNews(after, (offer) => known.has(offer.id)))
  return news
}

/** Bids for the user's players on their last day. */
export function lastDayNews(
  game: GameState,
  include: (offer: TransferOffer) => boolean = () => true,
): News[] {
  const { world } = game
  return game.market.offers
    .filter((offer) => offer.expires === game.today && include(offer))
    .map((offer) => ({
      tone: 'warning',
      text: `A proposta do ${world.clubs[offer.clubId].name} por ${world.players[offer.playerId].name} vence hoje.`,
      link: OFFERS,
    }))
}

/** The user's verdict on the season just closed, and the cup if they won it. */
function seasonEnd(game: GameState): News[] {
  const { world, userClubId } = game
  const summary = seasonSummary(game)
  const outcome = summary.leagues.find((l) => l.table.includes(userClubId))!
  const position = outcome.table.indexOf(userClubId) + 1
  const league = divisionName(outcome.division)
  const news: News[] = []
  if (position === 1) news.push({ tone: 'success', text: `Campeão da ${league}!` })
  if (outcome.promoted.includes(userClubId)) {
    news.push({ tone: 'success', text: `Acesso conquistado: ${position}º lugar na ${league}.` })
  } else if (outcome.relegated.includes(userClubId)) {
    news.push({ tone: 'error', text: `Rebaixado: ${position}º lugar na ${league}.` })
  } else if (position !== 1) {
    news.push({ tone: 'info', text: `Temporada encerrada em ${position}º lugar na ${league}.` })
  }
  if (cupWinner(game.season.cup) === userClubId) {
    news.push({ tone: 'success', text: `Campeão da ${CUP_NAME}!` })
  }
  const review = seasonReview(game)
  if (review.fired) {
    news.push({
      tone: 'error',
      text: `A diretoria do ${world.clubs[userClubId].name} não quer continuar com você.`,
    })
  } else if (review.offers.length > 0) {
    news.push({
      tone: 'info',
      text: `${review.offers.length} ${review.offers.length === 1 ? 'clube quer' : 'clubes querem'} você como técnico.`,
    })
  }
  return news
}

/** At most this many toasts at once; the rest are folded into one. */
export const MAX_TOASTS = 3

/**
 * Keeps the toasts in check: up to MAX_TOASTS as they are, or the first ones
 * and a last toast that sums up the others.
 */
export function foldNews(news: readonly News[]): { shown: News[]; folded: News[] } {
  if (news.length <= MAX_TOASTS) return { shown: [...news], folded: [] }
  return { shown: news.slice(0, MAX_TOASTS - 1), folded: news.slice(MAX_TOASTS - 1) }
}
