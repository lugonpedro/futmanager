import { PROMOTION_SPOTS } from '../season/rules.ts'
import type {
  Club,
  GameState,
  LedgerEntry,
  SecondaryDeal,
  SponsorDeal,
  SponsorGoal,
  Sponsorship,
  SponsorSlot,
} from '../model/types.ts'
import { addDays, dateParts, type GameDate } from '../season/calendar.ts'
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
  /**
   * Smaller sponsors around the master: each slot pays this share of the base
   * each month, give or take `spread`. All three together add about a quarter.
   */
  slots: { manga: 0.1, costas: 0.09, calcao: 0.06 } as Record<SponsorSlot, number>,
  spread: 0.15,
  /** On the 1st of a month, the chance an empty slot gets an offer. */
  offerChance: 0.35,
  /** Days a smaller offer waits for an answer. */
  offerDays: 20,
  /** Months smaller offers can come in: none in December, with the season closing. */
  lastOfferMonth: 11,
  /** Seasons a smaller deal lasts, from 1 to this. */
  secondaryLongest: 2,
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
  'Pneus Estrada Livre',
  'Óticas Visão Clara',
  'Imobiliária Lar Seguro',
  'Água Mineral Fonte Pura',
  'Auto Peças Motor Forte',
  'Escola Saber Mais',
  'Frigorífico Campo Bom',
  'Tintas Arco-Íris',
]

export const SLOTS: SponsorSlot[] = ['manga', 'costas', 'calcao']

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
  const { deadline: _, ...rest } = game.sponsorship
  return { ...game, sponsorship: { ...rest, master: offer, offers: [] } }
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

/** Every sponsor line the user's club is paid this month: the shirt first, then the smaller deals. */
export function userSponsorPayments(game: GameState): { amount: number; note: string }[] {
  return [
    userSponsorPayment(game),
    ...game.sponsorship.secondary.map((d) => ({ amount: d.monthly, note: d.company })),
  ]
}

/** The user's club's sponsorship in a month, all deals together. */
export const userSponsorTotal = (game: GameState) =>
  userSponsorPayments(game).reduce((sum, line) => sum + line.amount, 0)

/** Companies already with the club or waiting on an answer, so no one shows up twice. */
function companiesInUse(sponsorship: Sponsorship): Set<string> {
  return new Set(
    [
      sponsorship.master,
      ...sponsorship.offers,
      ...sponsorship.secondary,
      ...sponsorship.secondaryOffers,
    ].flatMap((d) => (d ? [d.company] : [])),
  )
}

/**
 * On the 1st of a month, smaller sponsors may knock: each empty slot with no
 * offer waiting gets one now and then, open for a few weeks.
 */
export function secondaryOffers(game: GameState, rng: Rng): GameState {
  const { sponsorship, today } = game
  const { month } = dateParts(today)
  if (month > SPONSOR.lastOfferMonth) return game
  const taken = new Set(
    [...sponsorship.secondary, ...sponsorship.secondaryOffers].map((d) => d.slot),
  )
  const used = companiesInUse(sponsorship)
  const free = COMPANIES.filter((c) => !used.has(c))
  const base = sponsorBase(game.world.clubs[game.userClubId])
  const year = game.season.year
  const fresh: SecondaryDeal[] = []
  for (const slot of SLOTS) {
    if (taken.has(slot) || free.length === 0 || rng.next() >= SPONSOR.offerChance) continue
    const company = free.splice(rng.int(0, free.length - 1), 1)[0]
    const swing = 1 + (rng.next() * 2 - 1) * SPONSOR.spread
    const seasons = rng.int(1, SPONSOR.secondaryLongest)
    fresh.push({
      id: `${today}-${slot}`,
      company,
      slot,
      monthly: Math.max(10_000, round(base * SPONSOR.slots[slot] * swing)),
      firstSeason: year,
      lastSeason: year + seasons - 1,
      expires: addDays(today, SPONSOR.offerDays),
    })
  }
  if (fresh.length === 0) return game
  return {
    ...game,
    sponsorship: { ...sponsorship, secondaryOffers: [...sponsorship.secondaryOffers, ...fresh] },
  }
}

/** Takes a smaller offer; it pays from the next 1st on. */
export function signSecondary(game: GameState, offerId: string): GameState {
  const { sponsorship } = game
  const offer = sponsorship.secondaryOffers.find((o) => o.id === offerId)
  if (!offer || sponsorship.secondary.some((d) => d.slot === offer.slot)) return game
  const { expires: _, ...deal } = offer
  return {
    ...game,
    sponsorship: {
      ...sponsorship,
      secondary: [...sponsorship.secondary, deal],
      secondaryOffers: sponsorship.secondaryOffers.filter((o) => o.id !== offerId),
    },
  }
}

/** Turns a smaller offer down; the slot can get another one in a later month. */
export function declineSecondary(game: GameState, offerId: string): GameState {
  const { sponsorship } = game
  const secondaryOffers = sponsorship.secondaryOffers.filter((o) => o.id !== offerId)
  if (secondaryOffers.length === sponsorship.secondaryOffers.length) return game
  return { ...game, sponsorship: { ...sponsorship, secondaryOffers } }
}

/** Smaller offers nobody answered go away after their last day. */
export function dropLapsedSponsorOffers(sponsorship: Sponsorship, date: GameDate): Sponsorship {
  const open = sponsorship.secondaryOffers.filter((o) => !o.expires || o.expires >= date)
  return open.length === sponsorship.secondaryOffers.length
    ? sponsorship
    : { ...sponsorship, secondaryOffers: open }
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
 * Closes the season for the sponsors: the shirt's bonus if the goal was met,
 * and which deals go on. A deal ends when its last season is over, when
 * the club goes down or when the manager moves to another club.
 */
export function closeSponsorSeason(
  sponsorship: Sponsorship,
  result: SeasonResult,
  date: GameDate,
  ends: { relegated: boolean; moving: boolean; nextYear: number },
): { bonus?: LedgerEntry; master?: SponsorDeal; secondary: SecondaryDeal[] } {
  const { master } = sponsorship
  const secondary = sponsorship.secondary.filter(
    (d) => d.lastSeason >= ends.nextYear && !ends.relegated && !ends.moving,
  )
  if (!master) return { secondary }
  const bonus: LedgerEntry | undefined = goalMet(master.goal, result)
    ? {
        date,
        category: 'patrocinio',
        amount: master.bonus,
        note: `Bônus do ${master.company} pela meta`,
      }
    : undefined
  const goesOn = master.lastSeason >= ends.nextYear && !ends.relegated && !ends.moving
  return { ...(bonus && { bonus }), ...(goesOn && { master }), secondary }
}
