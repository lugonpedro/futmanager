import { typicalWageBill } from '../finance/economy.ts'
import { wageFor } from '../generate/player.ts'
import { SQUAD_SHAPE } from '../generate/world.ts'
import { autoFormation, autoLineup } from '../match/lineup.ts'
import { formatMoney } from '../money.ts'
import {
  FREE_AGENT,
  RETIRED,
  type GameState,
  type Player,
  type Position,
  type TransferOffer,
  type TransferTalk,
  type World,
} from '../model/types.ts'
import { createRng, mixSeed, type Rng } from '../rng.ts'
import { addDays, formatDayMonth, transferWindowAt, type GameDate } from '../season/calendar.ts'

export const MARKET = {
  minSquad: 18,
  maxSquad: 32,
  minKeepers: 2,
  maxContractYears: 5,
  /** A club asks this much over market value for a regular starter, and for anyone else. */
  starterPremium: 1.6,
  squadPremium: 1.25,
  /** A player moving to a smaller club wants 1% more per point of reputation lost. */
  stepDownPremium: 0.01,
  /** Raise a player wants to sign anywhere new, and to renew where he is. */
  moveRaise: 0.15,
  renewRaise: 0.05,
  /** Days a bid for the user's player stands, unless the window closes first. */
  offerDays: 7,
  /** Chance per round that a club short of players goes shopping. */
  aiBuyChance: 0.3,
  /** An AI club spends at most this share of its cash on a signing plus a year of wages. */
  aiSpendShare: 0.35,
  /** Chance per round that a player the user listed draws a bid, and that anyone else does. */
  listedBidChance: 0.5,
  unlistedBidChance: 0.08,
  newsKept: 40,
  /** Most players an AI club in debt sells or releases at the close of a season. */
  debtSales: 4,
  /** AI clubs keep their wage bill under this share of a typical one for their reputation. */
  aiWageCap: 1.1,
  /** Bids a club hears for one player before it breaks off the talks; an insult counts twice. */
  talkBids: 3,
  /** Days talks stand after the last bid, and days a club won't talk after breaking them off. */
  talkDays: 14,
  /** A bid under this share of what the club would really take is an insult, not worth a counter. */
  lowballShare: 0.7,
  /** Share of the gap between its ask and the user's bid that a club gives up in a counter. */
  counterShare: 0.4,
  /** Every club comes down a little, and none more than this, from its asking price. */
  baseDiscount: 0.05,
  maxDiscount: 0.4,
}

/** Fewest players of each position a club tries to keep. */
export const MIN_SHAPE: Record<Position, number> = { G: 2, Z: 4, L: 3, M: 5, A: 4 }

export type Verdict = { ok: true } | { ok: false; reason: string }

/** Terms offered to sign a player: transfer fee to his club, monthly wage, seasons of contract. */
export type Bid = { fee: number; wage: number; years: number }

const round10k = (value: number) => Math.round(value / 10_000) * 10_000
const round1k = (value: number) => Math.round(value / 1000) * 1000

export const squadOf = (world: World, clubId: string) =>
  world.clubs[clubId].playerIds.map((id) => world.players[id])

export const freeAgents = (world: World) =>
  Object.values(world.players).filter((p) => p.clubId === FREE_AGENT)

/** A club lets a player go only if it keeps a squad and two keepers. */
export function canLeave(world: World, player: Player): boolean {
  if (player.clubId === RETIRED) return false
  if (player.clubId === FREE_AGENT) return true
  const squad = squadOf(world, player.clubId)
  if (squad.length <= MARKET.minSquad) return false
  if (player.position !== 'G') return true
  return squad.filter((p) => p.position === 'G').length > MARKET.minKeepers
}

function isStarter(world: World, player: Player): boolean {
  const squad = squadOf(world, player.clubId)
  return autoLineup(squad, autoFormation(squad)).starters.some((s) => s.playerId === player.id)
}

/** Transfer fee the player's club wants; nothing for a free agent. */
export function askingPrice(game: GameState, player: Player): number {
  if (player.clubId === FREE_AGENT) return 0
  const listed = game.market.listed[player.id]
  if (player.clubId === game.userClubId && listed !== undefined) return listed
  const premium = isStarter(game.world, player) ? MARKET.starterPremium : MARKET.squadPremium
  return round10k(player.marketValue * premium)
}

/** Fee the club wants from the user now: its asking price, or its latest counter in talks. */
export function currentAsk(game: GameState, player: Player): number {
  const asking = askingPrice(game, player)
  const talk = game.market.talks[player.id]
  return talk && !talk.brokenOff ? Math.min(talk.ask, asking) : asking
}

/** Something that makes a club sell for less than it asks, or for no less. */
export type Leverage = { discount: number; note: string }

/** Why a club would come down from its asking price for this player, as the user can see it. */
export function sellerLeverage(game: GameState, player: Player): Leverage[] {
  const { world, season } = game
  const club = world.clubs[player.clubId]
  if (!club) return []
  const squad = squadOf(world, club.id)
  const found: Leverage[] = []
  if (!isStarter(world, player)) found.push({ discount: 0.08, note: 'Não é titular no clube.' })
  else if (squad.every((p) => p.overall <= player.overall))
    found.push({ discount: -0.05, note: 'É o melhor do elenco: o clube não quer perdê-lo.' })
  if (player.contractUntil <= season.year)
    found.push({ discount: 0.15, note: 'O contrato acaba nesta temporada.' })
  else if (player.contractUntil === season.year + 1)
    found.push({ discount: 0.05, note: 'O contrato acaba na próxima temporada.' })
  if (player.age >= 31) found.push({ discount: 0.07, note: `Tem ${player.age} anos.` })
  if (club.cash < 0) found.push({ discount: 0.15, note: 'O clube está endividado.' })
  else if (monthlyWages(world, club.id) > wageCap(world, club.id))
    found.push({ discount: 0.08, note: 'O clube gasta mais do que pode com salários.' })
  if (countAt(squad, player.position) > SQUAD_SHAPE[player.position])
    found.push({ discount: 0.05, note: 'O clube tem jogadores de sobra na posição.' })
  return found
}

/**
 * The least the club would take for a player, which the user never sees: its
 * asking price, less what it gives up for its situation and the player's, and
 * a mood of its own that holds for the season, so asking again doesn't change it.
 */
export function sellerFloor(game: GameState, player: Player): number {
  const asking = askingPrice(game, player)
  const mood = createRng(mixSeed(game.world.seed, game.season.year, player.id, 'negociacao'))
  const discount = sellerLeverage(game, player).reduce(
    (sum, l) => sum + l.discount,
    MARKET.baseDiscount + 0.1 * mood.next() - 0.04,
  )
  return round10k(asking * (1 - Math.min(MARKET.maxDiscount, Math.max(0, discount))))
}

/** Monthly wage the player wants to join a club (or stay at his own). */
export function wageDemand(world: World, player: Player, clubId: string): number {
  const base = Math.max(player.wage, wageFor(player.overall))
  if (clubId === player.clubId) return round1k(base * (1 + MARKET.renewRaise))
  const from = world.clubs[player.clubId]?.reputation ?? 0
  const stepDown = Math.max(0, from - world.clubs[clubId].reputation) * MARKET.stepDownPremium
  return round1k(base * (1 + MARKET.moveRaise) * (1 + stepDown))
}

/** Moves a player to another club (or to the free agents) with new terms; fees change hands. */
export function transferPlayer(
  world: World,
  playerId: string,
  toClubId: string,
  terms: { fee: number; wage: number; contractUntil: number },
): World {
  const player = world.players[playerId]
  const clubs = { ...world.clubs }
  const fromId = player.clubId
  if (fromId !== FREE_AGENT) {
    const from = clubs[fromId]
    clubs[fromId] = {
      ...from,
      cash: from.cash + terms.fee,
      playerIds: from.playerIds.filter((id) => id !== playerId),
    }
  }
  if (toClubId !== FREE_AGENT) {
    const to = clubs[toClubId]
    clubs[toClubId] = { ...to, cash: to.cash - terms.fee, playerIds: [...to.playerIds, playerId] }
  }
  return {
    ...world,
    clubs,
    players: {
      ...world.players,
      [playerId]: {
        ...player,
        clubId: toClubId,
        wage: terms.wage,
        contractUntil: terms.contractUntil,
      },
    },
  }
}

function withNews(
  game: GameState,
  playerId: string,
  fromClubId: string,
  toClubId: string,
  fee: number,
) {
  const news = {
    season: game.season.year,
    date: game.today,
    playerId,
    fromClubId,
    toClubId,
    fee,
  }
  return [news, ...game.market.news].slice(0, MARKET.newsKept)
}

/** Drops listings and bids for a player who has just moved. */
function forgetPlayer(market: GameState['market'], playerId: string): GameState['market'] {
  const listed = { ...market.listed }
  delete listed[playerId]
  const talks = { ...market.talks }
  delete talks[playerId]
  return {
    ...market,
    listed,
    offers: market.offers.filter((o) => o.playerId !== playerId),
    talks,
  }
}

/** Whether a bid can be made at all, whatever the club thinks of the fee. */
function checkTerms(game: GameState, playerId: string, bid: Bid): Verdict {
  const { world, userClubId } = game
  const player = world.players[playerId]
  const club = world.clubs[userClubId]
  if (!player || player.clubId === userClubId || game.loans.some((l) => l.playerId === playerId)) {
    return { ok: false, reason: 'Jogador já é seu.' }
  }
  if (!Number.isInteger(bid.years) || bid.years < 1 || bid.years > MARKET.maxContractYears) {
    return { ok: false, reason: `O contrato vai de 1 a ${MARKET.maxContractYears} temporadas.` }
  }
  if (club.playerIds.length >= MARKET.maxSquad) {
    return { ok: false, reason: `Seu elenco já tem ${MARKET.maxSquad} jogadores.` }
  }
  if (player.clubId !== FREE_AGENT && !transferWindowAt(game.today)) {
    return {
      ok: false,
      reason: 'Janela de transferências fechada: só dá para contratar jogador sem clube.',
    }
  }
  if (!canLeave(world, player)) {
    return { ok: false, reason: `${world.clubs[player.clubId].name} não pode liberar o jogador.` }
  }
  const talk = game.market.talks[playerId]
  if (talk?.brokenOff) {
    return {
      ok: false,
      reason: `${world.clubs[player.clubId].name} encerrou a conversa. Só volta a negociar depois de ${formatDayMonth(talk.until)}.`,
    }
  }
  if (bid.fee < 0) return { ok: false, reason: 'A proposta não pode ser negativa.' }
  if (bid.fee > club.cash) return { ok: false, reason: 'Caixa insuficiente para a transferência.' }
  const demand = wageDemand(world, player, userClubId)
  if (bid.wage < demand)
    return { ok: false, reason: `${player.name} recusou: pede ${formatMoney(demand)} por mês.` }
  return { ok: true }
}

/** Whether the player's club and the player himself would accept the user's bid outright. */
export function checkSigning(game: GameState, playerId: string, bid: Bid): Verdict {
  const terms = checkTerms(game, playerId, bid)
  if (!terms.ok) return terms
  const player = game.world.players[playerId]
  const ask = currentAsk(game, player)
  if (bid.fee < ask) {
    return {
      ok: false,
      reason: `${game.world.clubs[player.clubId].name} recusou: pede ${formatMoney(ask)}.`,
    }
  }
  return { ok: true }
}

export function signPlayer(game: GameState, playerId: string, bid: Bid): GameState {
  const verdict = checkSigning(game, playerId, bid)
  if (!verdict.ok) throw new Error(verdict.reason)
  return completeSigning(game, playerId, bid)
}

/** How a club answered a bid: the player signed, it came back with a price, or it said no. */
export type BidOutcome = 'assinou' | 'contraproposta' | 'recusou' | 'rompeu' | 'invalida'

export type BidReply = { outcome: BidOutcome; message: string; game: GameState }

/**
 * The user bids for a player and the club answers. A fee at its ask, or over
 * the least it would take, closes the deal. Below that it counters, coming
 * down toward the bid, or ignores a bid far too low; after a few bids it breaks
 * off the talks for a while.
 */
export function bidForPlayer(game: GameState, playerId: string, bid: Bid): BidReply {
  const terms = checkTerms(game, playerId, bid)
  if (!terms.ok) return { outcome: 'invalida', message: terms.reason, game }
  const player = game.world.players[playerId]
  const signed = (opening: string): BidReply => ({
    outcome: 'assinou',
    message: `${opening}${player.name} assinou até ${game.season.year + bid.years - 1}.`,
    game: completeSigning(game, playerId, bid),
  })
  const ask = currentAsk(game, player)
  if (bid.fee >= ask) return signed(bid.fee > 0 ? `Contratado por ${formatMoney(bid.fee)}. ` : '')
  const clubName = game.world.clubs[player.clubId].name
  const floor = sellerFloor(game, player)
  if (bid.fee >= floor) return signed(`${clubName} aceitou ${formatMoney(bid.fee)}. `)

  const insult = bid.fee < floor * MARKET.lowballShare
  const bids = (game.market.talks[playerId]?.bids ?? 0) + (insult ? 2 : 1)
  const until = addDays(game.today, MARKET.talkDays)
  const withTalk = (talk: TransferTalk): GameState => ({
    ...game,
    market: { ...game.market, talks: { ...game.market.talks, [playerId]: talk } },
  })
  if (bids >= MARKET.talkBids) {
    return {
      outcome: 'rompeu',
      message: `${clubName} cansou das propostas e encerrou a conversa. Só volta a negociar depois de ${formatDayMonth(until)}.`,
      game: withTalk({ ask: askingPrice(game, player), bids, until, brokenOff: true }),
    }
  }
  const left = MARKET.talkBids - bids
  const patience = `Ouve mais ${left} ${left === 1 ? 'proposta' : 'propostas'} antes de encerrar a conversa.`
  if (insult) {
    return {
      outcome: 'recusou',
      message: `${clubName} achou a proposta baixa demais e nem fez contraproposta. ${patience}`,
      game: withTalk({ ask, bids, until, brokenOff: false }),
    }
  }
  const counter = Math.min(
    ask,
    Math.max(floor, round10k(ask - (ask - bid.fee) * MARKET.counterShare)),
  )
  return {
    outcome: 'contraproposta',
    message: `${clubName} recusou, mas aceita fechar por ${formatMoney(counter)}. ${patience}`,
    game: withTalk({ ask: counter, bids, until, brokenOff: false }),
  }
}

/** Moves the player to the user's club on the bid's terms, with no questions asked. */
function completeSigning(game: GameState, playerId: string, bid: Bid): GameState {
  const player = game.world.players[playerId]
  const from = player.clubId
  const world = transferPlayer(game.world, playerId, game.userClubId, {
    fee: bid.fee,
    wage: bid.wage,
    contractUntil: game.season.year + bid.years - 1,
  })
  const ledger =
    bid.fee > 0
      ? [
          ...game.ledger,
          {
            date: game.today,
            category: 'compras' as const,
            amount: -bid.fee,
            note: `${player.name} (${from === FREE_AGENT ? 'sem clube' : game.world.clubs[from].name})`,
          },
        ]
      : game.ledger
  return {
    ...game,
    world,
    ledger,
    market: {
      ...forgetPlayer(game.market, playerId),
      news: withNews(game, playerId, from, game.userClubId, bid.fee),
    },
  }
}

/** Puts one of the user's players up for sale at a price, or takes him off with undefined. */
export function listPlayer(game: GameState, playerId: string, price?: number): GameState {
  if (game.world.players[playerId]?.clubId !== game.userClubId) throw new Error('Not your player')
  const listed = { ...game.market.listed }
  if (price === undefined) delete listed[playerId]
  else listed[playerId] = round10k(Math.max(0, price))
  return { ...game, market: { ...game.market, listed } }
}

/** Stars a player, or takes the star off one who has it. */
export function toggleFavorite(game: GameState, playerId: string): GameState {
  if (!game.world.players[playerId]) throw new Error('Unknown player')
  const favorites = game.favorites.includes(playerId)
    ? game.favorites.filter((id) => id !== playerId)
    : [...game.favorites, playerId]
  return { ...game, favorites }
}

export function acceptOffer(game: GameState, offerId: string): GameState {
  const offer = game.market.offers.find((o) => o.id === offerId)
  if (!offer) throw new Error('Unknown offer')
  const { world } = game
  const player = world.players[offer.playerId]
  if (player.clubId !== game.userClubId || !canLeave(world, player)) {
    throw new Error('O jogador não pode sair agora.')
  }
  if (world.clubs[offer.clubId].cash < offer.fee)
    throw new Error('O clube já não tem esse dinheiro.')
  const next = transferPlayer(world, player.id, offer.clubId, {
    fee: offer.fee,
    wage: wageDemand(world, player, offer.clubId),
    contractUntil: game.season.year + 2,
  })
  return {
    ...game,
    world: next,
    ledger: [
      ...game.ledger,
      {
        date: game.today,
        category: 'vendas',
        amount: offer.fee,
        note: `${player.name} para ${world.clubs[offer.clubId].name}`,
      },
    ],
    market: {
      ...forgetPlayer(game.market, player.id),
      news: withNews(game, player.id, game.userClubId, offer.clubId, offer.fee),
    },
  }
}

export function rejectOffer(game: GameState, offerId: string): GameState {
  return {
    ...game,
    market: { ...game.market, offers: game.market.offers.filter((o) => o.id !== offerId) },
  }
}

/** Wage a player wants to extend his contract. */
/** What a player asks to stay at `clubId`, his own club unless he is out on loan from it. */
export const renewalDemand = (world: World, player: Player, clubId = player.clubId) =>
  wageDemand(world, player, clubId)

export function checkRenewal(
  game: GameState,
  playerId: string,
  wage: number,
  years: number,
): Verdict {
  const player = game.world.players[playerId]
  const onLoan = game.loans.some((l) => l.playerId === playerId)
  if (player?.clubId !== game.userClubId && !onLoan) {
    return { ok: false, reason: 'Jogador não é seu.' }
  }
  if (!Number.isInteger(years) || years < 1 || years > MARKET.maxContractYears) {
    return { ok: false, reason: `Renove por 1 a ${MARKET.maxContractYears} temporadas.` }
  }
  const demand = renewalDemand(game.world, player, game.userClubId)
  if (wage < demand)
    return { ok: false, reason: `${player.name} recusou: pede ${formatMoney(demand)} por mês.` }
  return { ok: true }
}

/** Extends a contract by `years` seasons from the later of its end and this season. */
export function renewContract(
  game: GameState,
  playerId: string,
  wage: number,
  years: number,
): GameState {
  const verdict = checkRenewal(game, playerId, wage, years)
  if (!verdict.ok) throw new Error(verdict.reason)
  const player = game.world.players[playerId]
  const contractUntil = Math.max(player.contractUntil, game.season.year) + years
  return {
    ...game,
    world: {
      ...game.world,
      players: { ...game.world.players, [playerId]: { ...player, wage, contractUntil } },
    },
  }
}

/** Monthly wages an AI club is willing to carry, from what a club its size earns. */
function wageCap(world: World, clubId: string): number {
  const club = world.clubs[clubId]
  const typical = typicalWageBill(club.reputation)
  // Money in the bank lets a club stretch: half a year of wages more for every two years saved.
  const savedYears = Math.max(0, club.cash) / (typical * 12)
  return typical * (MARKET.aiWageCap + Math.min(0.5, savedYears * 0.25))
}

const monthlyWages = (world: World, clubId: string) =>
  squadOf(world, clubId).reduce((sum, p) => sum + p.wage, 0)

const countAt = (squad: readonly Player[], position: Position) =>
  squad.filter((p) => p.position === position).length

/** Fewer players than a squad needs, overall or in some position. */
const isShort = (squad: readonly Player[]) =>
  squad.length < MARKET.minSquad ||
  (Object.keys(MIN_SHAPE) as Position[]).some((p) => countAt(squad, p) < MIN_SHAPE[p])

/** The position a club most needs, if it is short anywhere. */
export function neededPosition(squad: readonly Player[]): Position | undefined {
  const short = (Object.keys(MIN_SHAPE) as Position[])
    .filter((p) => countAt(squad, p) < MIN_SHAPE[p])
    .sort((a, b) => countAt(squad, a) / MIN_SHAPE[a] - countAt(squad, b) / MIN_SHAPE[b])
  if (short.length > 0) return short[0]
  if (squad.length >= 22) return undefined
  return (Object.keys(SQUAD_SHAPE) as Position[]).sort(
    (a, b) => countAt(squad, a) / SQUAD_SHAPE[a] - countAt(squad, b) / SQUAD_SHAPE[b],
  )[0]
}

/**
 * An AI club signs the best player it can afford for a position: free agents,
 * or spares from other AI clubs that have more than they need there.
 */
function aiSign(
  game: GameState,
  clubId: string,
  position: Position,
  rng: Rng,
  anyCost: boolean,
  /** First season of the contract: the next one when signing at the close. */
  fromYear = game.season.year,
): GameState {
  const { world } = game
  const club = world.clubs[clubId]
  const budget = club.cash * MARKET.aiSpendShare
  // Out of the windows only free agents can sign; the close of a season opens the next one.
  const windowOpen = fromYear > game.season.year || transferWindowAt(game.today) !== undefined
  const onLoan = new Set(game.loans.map((l) => l.playerId))
  const candidates = Object.values(world.players).filter((p) => {
    if (p.position !== position || p.clubId === clubId || p.clubId === game.userClubId) return false
    if (onLoan.has(p.id)) return false
    if (p.clubId === RETIRED) return false
    if (p.clubId === FREE_AGENT) return true
    if (!windowOpen) return false
    const seller = squadOf(world, p.clubId)
    return countAt(seller, position) > SQUAD_SHAPE[position] && canLeave(world, p)
  })
  const cost = (p: Player) => askingPrice(game, p) + 12 * wageDemand(world, p, clubId)
  const wageRoom = wageCap(world, clubId) - monthlyWages(world, clubId)
  const affordable = candidates.filter(
    (p) => cost(p) <= budget && wageDemand(world, p, clubId) <= wageRoom,
  )
  const pool =
    affordable.length > 0
      ? affordable
      : anyCost
        ? candidates.filter((p) => p.clubId === FREE_AGENT)
        : []
  if (pool.length === 0) return game
  const choice =
    affordable.length > 0
      ? pool.reduce((a, b) => (b.overall > a.overall ? b : a))
      : pool.reduce((a, b) => (cost(b) < cost(a) ? b : a))
  const fee = askingPrice(game, choice)
  const from = choice.clubId
  return {
    ...game,
    world: transferPlayer(world, choice.id, clubId, {
      fee,
      wage: wageDemand(world, choice, clubId),
      contractUntil: fromYear + rng.int(0, 2),
    }),
    market: { ...game.market, news: withNews(game, choice.id, from, clubId, fee) },
  }
}

/**
 * An AI club in the red, or paying more than it can carry, sells its best-paid
 * spares to clubs that can afford them, or lets them go to cut the wage bill.
 */
function aiClearDebt(game: GameState, clubId: string): GameState {
  let next = game
  const struggling = (world: World) =>
    world.clubs[clubId].cash < 0 || monthlyWages(world, clubId) > wageCap(world, clubId)
  const onLoan = new Set(game.loans.map((l) => l.playerId))
  for (let sold = 0; sold < MARKET.debtSales && struggling(next.world); sold++) {
    const { world } = next
    const player = squadOf(world, clubId)
      .filter(
        (p) =>
          !onLoan.has(p.id) &&
          canLeave(world, p) &&
          !isShort(squadOf(world, clubId).filter((q) => q !== p)),
      )
      .sort((a, b) => b.wage - a.wage || a.id.localeCompare(b.id))[0]
    if (!player) break
    const fee = round10k(player.marketValue)
    const buyer = aiClubIds(next)
      .filter((id) => id !== clubId)
      .map((id) => world.clubs[id])
      .filter(
        (c) => c.cash * MARKET.aiSpendShare >= fee && c.playerIds.length < MARKET.maxSquad - 4,
      )
      .sort((a, b) => b.cash - a.cash)[0]
    const toClubId = buyer?.id ?? FREE_AGENT
    next = {
      ...next,
      world: transferPlayer(world, player.id, toClubId, {
        fee: buyer ? fee : 0,
        wage: buyer ? wageDemand(world, player, buyer.id) : player.wage,
        contractUntil: next.season.year + 3,
      }),
      market: {
        ...next.market,
        news: buyer ? withNews(next, player.id, clubId, buyer.id, fee) : next.market.news,
      },
    }
  }
  return next
}

const aiClubIds = (game: GameState) =>
  Object.keys(game.world.clubs)
    .filter((id) => id !== game.userClubId)
    .sort()

/** AI clubs bid for the user's players while a window is open: often for listed ones, now and then for a star. */
function aiBids(game: GameState, rng: Rng): TransferOffer[] {
  const { world, userClubId, today } = game
  const offers: TransferOffer[] = []
  const window = transferWindowAt(today)
  if (!window) return offers
  const lastDay = addDays(today, MARKET.offerDays)
  const expires = lastDay < window.to ? lastDay : window.to
  const buyers = (fee: number) =>
    aiClubIds(game).filter(
      (id) =>
        world.clubs[id].cash * MARKET.aiSpendShare >= fee &&
        world.clubs[id].playerIds.length < MARKET.maxSquad,
    )
  const bid = (player: Player, fee: number, askingPrice?: number) => {
    const clubs = buyers(fee).filter(
      (id) => !game.market.offers.some((o) => o.playerId === player.id && o.clubId === id),
    )
    if (clubs.length === 0) return
    offers.push({
      id: `${today}-${player.id}-${offers.length}`,
      playerId: player.id,
      clubId: rng.pick(clubs),
      fee,
      date: today,
      expires,
      ...(askingPrice !== undefined && { askingPrice }),
    })
  }

  for (const [playerId, price] of Object.entries(game.market.listed).sort()) {
    const player = world.players[playerId]
    if (player?.clubId !== userClubId || !canLeave(world, player)) continue
    if (rng.next() < MARKET.listedBidChance)
      bid(player, round10k(price * (0.85 + 0.2 * rng.next())), price)
  }
  if (rng.next() < MARKET.unlistedBidChance) {
    const squad = squadOf(world, userClubId)
      .filter((p) => game.market.listed[p.id] === undefined && canLeave(world, p))
      .sort((a, b) => b.overall - a.overall)
      .slice(0, 15)
    if (squad.length > 0) {
      const player = rng.pick(squad)
      bid(player, round10k(player.marketValue * (1.2 + 0.3 * rng.next())))
    }
  }
  return offers
}

/** Bids still standing on a day, and talks: open ones end with the window, too. */
export const dropLapsedOffers = (market: GameState['market'], date: GameDate) => {
  const open = transferWindowAt(date) !== undefined
  return {
    ...market,
    offers: market.offers.filter((o) => o.expires >= date),
    talks: Object.fromEntries(
      Object.entries(market.talks).filter(([, t]) => t.until >= date && (t.brokenOff || open)),
    ),
  }
}

/** The market's turn: AI clubs fill gaps and, in a window, bid for the user's players. */
export function marketRound(game: GameState, rng: Rng): GameState {
  let next = game
  for (const clubId of aiClubIds(next)) {
    const squad = squadOf(next.world, clubId)
    const position = neededPosition(squad)
    if (!position) continue
    // A club that can't field a proper side signs a free agent at once, money or not.
    if (isShort(squad)) next = aiSign(next, clubId, position, rng, true)
    else if (rng.next() < MARKET.aiBuyChance) next = aiSign(next, clubId, position, rng, false)
  }
  return {
    ...next,
    market: { ...next.market, offers: [...next.market.offers, ...aiBids(next, rng)] },
  }
}

/**
 * Season's end for contracts: the user's players out of contract leave; AI
 * clubs keep the useful ones and let the rest go; then everyone short of
 * players signs free agents so the new season starts with full squads.
 */
export function closeContracts(game: GameState, nextYear: number, rng: Rng): GameState {
  let world = game.world
  let market = game.market
  // The best players are offered new terms first, while there is still room in the wage bill.
  const players = Object.values(game.world.players).sort(
    (a, b) => b.overall - a.overall || a.id.localeCompare(b.id),
  )
  for (const player of players) {
    if (player.clubId === FREE_AGENT || player.clubId === RETIRED) continue
    if (player.contractUntil >= nextYear) continue
    const club = world.clubs[player.clubId]
    const squad = squadOf(world, club.id)
    const average = squad.reduce((sum, p) => sum + p.overall, 0) / squad.length
    // A club in debt only keeps the players who are worth their wages.
    const margin = club.cash < 0 ? 0 : 10
    const wage = Math.max(player.wage, wageFor(player.overall))
    const keep =
      club.id !== game.userClubId &&
      player.age <= 33 &&
      player.overall >= average - margin &&
      monthlyWages(world, club.id) - player.wage + wage <= wageCap(world, club.id)
    if (keep) {
      world = {
        ...world,
        players: {
          ...world.players,
          [player.id]: {
            ...player,
            wage,
            contractUntil: nextYear + rng.int(0, 2),
          },
        },
      }
    } else {
      world = transferPlayer(world, player.id, FREE_AGENT, {
        fee: 0,
        wage: player.wage,
        contractUntil: nextYear,
      })
      market = forgetPlayer(market, player.id)
    }
  }
  let next: GameState = { ...game, world, market: { ...market, offers: [], talks: {} } }
  for (const clubId of aiClubIds(next)) next = aiClearDebt(next, clubId)
  for (const clubId of aiClubIds(next)) {
    // Bounded so a club with no money and no fitting free agents can't loop forever.
    for (let i = 0; i < 15; i++) {
      const position = neededPosition(squadOf(next.world, clubId))
      if (!position) break
      const before = next
      next = aiSign(next, clubId, position, rng, true, nextYear)
      if (next === before) break
    }
  }
  return next
}
