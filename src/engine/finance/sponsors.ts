import { PROMOTION_SPOTS } from '../season/rules.ts'
import type {
  Club,
  GameState,
  LedgerEntry,
  SponsorDeal,
  SponsorGoal,
  Sponsorship,
} from '../model/types.ts'
import type { GameDate } from '../season/calendar.ts'
import type { Rng } from '../rng.ts'
import { monthlySponsorship } from './economy.ts'

/**
 * Sponsorship knobs. A deal is sized from what the club used to get each
 * month (`monthlySponsorship`), moved by how the last season went.
 */
export const SPONSOR = {
  /** Without a shirt sponsor the club still gets this share from smaller deals. */
  standIn: 0.5,
  /** Monthly pay as a share of the base, and the bonus in months of the base. */
  styles: {
    segura: { monthly: 1, bonusMonths: 2 },
    equilibrada: { monthly: 0.85, bonusMonths: 5 },
    ousada: { monthly: 0.7, bonusMonths: 10 },
  },
  /** How the last season moves the offers: titles and promotions sell shirts. */
  champion: 1.15,
  promoted: 1.1,
  relegated: 0.9,
  /** Seasons a deal lasts, from 1 to this. */
  longest: 3,
}

/** Made-up companies: the game never carries real sponsors' names. */
const COMPANIES = [
  'Banco Horizonte',
  'Laticínios Serra Azul',
  'Construtora Pedra Firme',
  'Seguros Atlântico',
  'Café Morro Alto',
  'Transportes Rota Sul',
  'Farmácias Bem Viver',
  'Energia Vale Verde',
  'Supermercados Bom Preço',
  'Telecom Ponte',
  'Moinho Dourado',
  'Calçados Passo Certo',
]

const round = (value: number) => Math.round(value / 10_000) * 10_000

/** How the club's last season went, as far as sponsors care. */
export type LastSeason = { champion: boolean; promoted: boolean; relegated: boolean }

/** The monthly value a deal is built from. */
export function sponsorBase(club: Club, last?: LastSeason): number {
  const swing = !last
    ? 1
    : last.champion
      ? SPONSOR.champion
      : last.promoted
        ? SPONSOR.promoted
        : last.relegated
          ? SPONSOR.relegated
          : 1
  return monthlySponsorship(club) * swing
}

/**
 * The goals on offer: the safe deal asks for what the board expects, the
 * balanced one for a step more (the acesso, the G-4 or the cup final), the
 * bold one for the title.
 */
function goals(division: number, target: number): Record<SponsorDeal['style'], SponsorGoal> {
  const position = (n: number): SponsorGoal => ({ kind: 'posicao', position: n })
  const step =
    target <= 1
      ? ({ kind: 'final-copa' } as const)
      : division > 1 && target > PROMOTION_SPOTS
        ? position(PROMOTION_SPOTS)
        : target > 4
          ? position(4)
          : position(Math.max(1, target - 1))
  return {
    segura: position(target),
    equilibrada: step,
    ousada: target <= 1 ? { kind: 'final-copa' } : position(1),
  }
}

/** Three shirt offers for the user's club for `year`: a safe, a balanced and a bold one. */
export function sponsorOffers(
  club: Club,
  target: number,
  year: number,
  rng: Rng,
  last?: LastSeason,
): SponsorDeal[] {
  const base = sponsorBase(club, last)
  const goal = goals(club.division, target)
  const companies = [...COMPANIES]
  return (['segura', 'equilibrada', 'ousada'] as const).map((style) => {
    const company = companies.splice(rng.int(0, companies.length - 1), 1)[0]
    const { monthly, bonusMonths } = SPONSOR.styles[style]
    const seasons = rng.int(1, SPONSOR.longest)
    return {
      id: `${year}-${style}`,
      company,
      monthly: round(base * monthly),
      bonus: round(base * bonusMonths),
      goal: goal[style],
      style,
      firstSeason: year,
      lastSeason: year + seasons - 1,
    }
  })
}

/** Signs one of the open offers as the shirt sponsor; the others are turned down. */
export function signSponsor(game: GameState, offerId: string): GameState {
  const offer = game.sponsorship.offers.find((o) => o.id === offerId)
  if (!offer || game.sponsorship.master) return game
  return { ...game, sponsorship: { master: offer, offers: [] } }
}

/** On the deadline with no choice made, the board signs the safest offer. */
export function settleSponsorship(game: GameState): GameState {
  const { master, offers, deadline } = game.sponsorship
  if (master || offers.length === 0 || !deadline || game.today < deadline) return game
  const safest = offers.find((o) => o.style === 'segura') ?? offers[0]
  return signSponsor(game, safest.id)
}

/** What the shirt pays the user's club this month, and the line it goes under. */
export function userSponsorPayment(game: GameState): { amount: number; note: string } {
  const { master } = game.sponsorship
  if (master) return { amount: master.monthly, note: master.company }
  const club = game.world.clubs[game.userClubId]
  return { amount: round(monthlySponsorship(club) * SPONSOR.standIn), note: 'Patrocínios avulsos' }
}

/** How the user's club did in a season, for the sponsor's goal. */
export type SeasonResult = {
  division: number
  position: number
  promoted: boolean
  cupFinal: boolean
}

export function goalMet(goal: SponsorGoal | undefined, result: SeasonResult): boolean {
  if (!goal) return false
  if (goal.kind === 'final-copa') return result.cupFinal
  return result.position <= goal.position
}

/**
 * Closes the season for the shirt sponsor: the bonus if the goal was met,
 * and whether the deal goes on. It ends when its last season is over, when
 * the club goes down or when the manager moves to another club.
 */
export function closeSponsorSeason(
  sponsorship: Sponsorship,
  result: SeasonResult,
  date: GameDate,
  ends: { relegated: boolean; moving: boolean; nextYear: number },
): { bonus?: LedgerEntry; master?: SponsorDeal } {
  const { master } = sponsorship
  if (!master) return {}
  const bonus: LedgerEntry | undefined = goalMet(master.goal, result)
    ? {
        date,
        category: 'patrocinio',
        amount: master.bonus,
        note: `Bônus do ${master.company} pela meta`,
      }
    : undefined
  const goesOn = master.lastSeason >= ends.nextYear && !ends.relegated && !ends.moving
  return { ...(bonus && { bonus }), ...(goesOn && { master }) }
}
