import { SQUAD_SHAPE } from '../generate/world.ts'
import { RETIRED, type GameState, type Player } from '../model/types.ts'
import { transferWindowAt } from '../season/calendar.ts'
import { canLeave, MARKET, squadOf, transferPlayer, type Verdict } from './market.ts'

export const LOAN = {
  /** Only young players go out on loan. */
  maxAge: 23,
  /** The user's players out on loan at once, at most. */
  maxLoans: 4,
}

export const isOnLoan = (game: GameState, playerId: string) =>
  game.loans.some((l) => l.playerId === playerId)

/**
 * Where a loan goes: a club a division below the user's (the lowest one if
 * the user is already there), the one with the fewest players in his
 * position for its size, so he gets games.
 */
export function loanClub(game: GameState, player: Player): string | undefined {
  const { world, userClubId } = game
  const lowest = Math.max(...world.leagues.map((l) => l.division))
  const division = Math.min(lowest, world.clubs[userClubId].division + 1)
  const need = (clubId: string) =>
    squadOf(world, clubId).filter((p) => p.position === player.position).length /
    SQUAD_SHAPE[player.position]
  return Object.values(world.clubs)
    .filter(
      (c) => c.id !== userClubId && c.division === division && c.playerIds.length < MARKET.maxSquad,
    )
    .map((c) => c.id)
    .sort((a, b) => need(a) - need(b) || a.localeCompare(b))[0]
}

/** Whether one of the user's players can go out on loan now. */
export function checkLoan(game: GameState, playerId: string): Verdict {
  const player = game.world.players[playerId]
  if (!player || player.clubId !== game.userClubId)
    return { ok: false, reason: 'Jogador não é seu.' }
  if (player.age > LOAN.maxAge) {
    return { ok: false, reason: `Só jogadores de até ${LOAN.maxAge} anos vão emprestados.` }
  }
  if (game.loans.length >= LOAN.maxLoans) {
    return { ok: false, reason: `Você já tem ${LOAN.maxLoans} jogadores emprestados.` }
  }
  if (!transferWindowAt(game.today)) {
    return { ok: false, reason: 'Empréstimos só com a janela de transferências aberta.' }
  }
  if (!canLeave(game.world, player)) {
    return { ok: false, reason: 'O elenco ficaria curto demais sem ele.' }
  }
  if (!loanClub(game, player)) return { ok: false, reason: 'Nenhum clube tem vaga para ele.' }
  return { ok: true }
}

/**
 * Sends a player out on loan until the end of the season. He keeps his
 * contract; the other club pays his wages while he is there. Listings, bids
 * and his training focus go.
 */
export function loanPlayer(game: GameState, playerId: string): GameState {
  const verdict = checkLoan(game, playerId)
  if (!verdict.ok) throw new Error(verdict.reason)
  const player = game.world.players[playerId]
  const clubId = loanClub(game, player)!
  const world = transferPlayer(game.world, playerId, clubId, {
    fee: 0,
    wage: player.wage,
    contractUntil: player.contractUntil,
  })
  const listed = { ...game.market.listed }
  delete listed[playerId]
  const individual = { ...game.training.individual }
  delete individual[playerId]
  return {
    ...game,
    world,
    market: {
      ...game.market,
      listed,
      offers: game.market.offers.filter((o) => o.playerId !== playerId),
    },
    training: { ...game.training, individual },
    loans: [...game.loans, { playerId, clubId, season: game.season.year }],
  }
}

/** Everyone out on loan comes back to the user's club, at the end of the season. */
export function returnLoans(game: GameState): GameState {
  let world = game.world
  for (const loan of game.loans) {
    const player = world.players[loan.playerId]
    if (!player || player.clubId === RETIRED || player.clubId === game.userClubId) continue
    world = transferPlayer(world, loan.playerId, game.userClubId, {
      fee: 0,
      wage: player.wage,
      contractUntil: player.contractUntil,
    })
  }
  return { ...game, world, loans: [] }
}
