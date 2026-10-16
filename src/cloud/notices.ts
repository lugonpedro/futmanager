// The game's notices: which one is due at a given time, and what it says. The
// fantasy-notify function sends them; the service worker shows them.
import { marketClosesAt } from '../engine/fantasy/team.ts'

/** The kinds of notice a player can turn on or off. */
export type NoticeKind = 'mercado' | 'rodada'

/** What the service worker shows: the text and the page a tap opens. */
export type Notice = { title: string; body: string; url: string; tag: string }

/** How long before the market closes the warning goes out, at most. */
export const MARKET_WARNING_HOURS = 2

/** How long after a round is played its notice may still go out. */
export const ROUND_NOTICE_HOURS = 3

export type SeasonRow = {
  id: number
  status: string
  played: number
  rounds: number
  lastPlayedAt: Date
}

const points = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})

const clock = new Intl.DateTimeFormat('pt-BR', {
  timeZone: 'America/Sao_Paulo',
  hour: '2-digit',
  minute: '2-digit',
})

/** The round whose market closes soon, or undefined when no warning is due. */
export function dueMarketWarning(season: SeasonRow, now: Date) {
  if (season.status !== 'em_andamento' || season.played >= season.rounds) return undefined
  const closesAt = marketClosesAt(season.lastPlayedAt)
  const left = closesAt.getTime() - now.getTime()
  if (left <= 0 || left > MARKET_WARNING_HOURS * 3_600_000) return undefined
  return { round: season.played + 1, closesAt }
}

/** The round just played, or undefined when it is too old to tell. */
export function dueRoundNotice(season: SeasonRow, now: Date) {
  if (season.played < 1) return undefined
  if (now.getTime() - season.lastPlayedAt.getTime() > ROUND_NOTICE_HOURS * 3_600_000)
    return undefined
  return { round: season.played }
}

export function marketNotice(round: number, closesAt: Date): Notice {
  return {
    title: 'O mercado vai fechar',
    body: `O mercado da rodada ${round} fecha às ${clock.format(closesAt)}. Confira o seu time antes.`,
    url: '/fantasia',
    tag: `mercado-${round}`,
  }
}

/** The round's notice; with the player's points when they had a team. */
export function roundNotice(round: number, score?: number): Notice {
  return {
    title: `Rodada ${round} jogada`,
    body:
      score === undefined
        ? 'Veja os resultados e os jogos da rodada.'
        : `Seu time fez ${points.format(score)} pontos. Veja os jogos da rodada.`,
    url: `/fantasia/rodada/${round}`,
    tag: `rodada-${round}`,
  }
}
