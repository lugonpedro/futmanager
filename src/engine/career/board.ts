import type { Career, GameState, World } from '../model/types.ts'
import type { Rng } from '../rng.ts'
import { PROMOTION_SPOTS } from '../season/rules.ts'

export const BOARD = {
  /** Confidence a manager starts a new job with. */
  startConfidence: 60,
  /** Confidence moved by each league win and loss. */
  win: 2,
  loss: -2,
  /** From this round the board also looks at the table. */
  pressureFrom: 6,
  /** Positions below target the board shrugs off mid-season. */
  slack: 2,
  /** End of season: a target met is worth this much; a miss costs a base plus a bit per place. */
  targetMet: 20,
  missBase: 10,
  missPerPlace: 5,
  /** A new season starts with at least this much patience, and at most this much credit. */
  newSeasonFloor: 40,
  newSeasonCeiling: 80,
  /** Clubs that call a sacked manager, and the most that call after a good season. */
  offersWhenFired: 3,
  offersWhenGood: 2,
  /** Confidence after the close needed to draw interest from bigger clubs. */
  goodSeason: 70,
}

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)))

const leagueWith = (world: World, clubId: string) => {
  const league = world.leagues.find((l) => l.clubIds.includes(clubId))
  if (!league) throw new Error(`Club ${clubId} is in no league`)
  return league
}

/**
 * The final position the board expects: two places below where the club's
 * reputation ranks it in its league, and never worse than staying up.
 */
export function seasonTarget(world: World, clubId: string): number {
  const league = leagueWith(world, clubId)
  const rank =
    [...league.clubIds]
      .sort((a, b) => world.clubs[b].reputation - world.clubs[a].reputation || a.localeCompare(b))
      .indexOf(clubId) + 1
  return Math.min(league.clubIds.length - PROMOTION_SPOTS, rank + 2)
}

/** The target in words, as the board would put it. */
export function objectiveText(world: World, clubId: string, target: number): string {
  const league = leagueWith(world, clubId)
  const lowest = Math.max(...world.leagues.map((l) => l.division))
  if (target === 1) return 'Ser campeão'
  if (league.division > 1 && target <= PROMOTION_SPOTS) return 'Conquistar o acesso'
  if (league.division < lowest && target === league.clubIds.length - PROMOTION_SPOTS)
    return 'Escapar do rebaixamento'
  return `Terminar entre os ${target} primeiros`
}

export function newCareer(world: World, clubId: string, history: Career['history'] = []): Career {
  return {
    status: 'empregado',
    target: seasonTarget(world, clubId),
    confidence: BOARD.startConfidence,
    jobOffers: [],
    history,
  }
}

/** The board's mood after a league match: results first, then the table once it means something. */
export function confidenceAfterMatch(
  career: Career,
  scored: number,
  conceded: number,
  position: number,
  round: number,
): number {
  let confidence = career.confidence
  if (scored > conceded) confidence += BOARD.win
  else if (scored < conceded) confidence += BOARD.loss
  if (round >= BOARD.pressureFrom) {
    const behind = position - career.target - BOARD.slack
    if (behind > 0) confidence -= Math.min(4, behind)
    else if (position <= career.target) confidence += 1
  }
  return clamp(confidence)
}

/** End of season: the board weighs the final position against the target. */
export function confidenceAtClose(career: Career, position: number): number {
  const missed = position - career.target
  const change = missed <= 0 ? BOARD.targetMet : -(BOARD.missBase + BOARD.missPerPlace * missed)
  return clamp(career.confidence + change)
}

/**
 * Clubs that want the manager. A sacked one hears from clubs a step or two
 * smaller; one coming off a good season may hear from bigger ones.
 */
export function findJobOffers(game: GameState, kind: 'demitido' | 'sucesso', rng: Rng): string[] {
  const { world, userClubId } = game
  const reputation = world.clubs[userClubId].reputation
  const others = Object.values(world.clubs)
    .filter((c) => c.id !== userClubId)
    .sort((a, b) => a.id.localeCompare(b.id))
  if (kind === 'demitido') {
    const ideal = reputation - 12
    const nearest = [...others]
      .sort((a, b) => Math.abs(a.reputation - ideal) - Math.abs(b.reputation - ideal))
      .slice(0, BOARD.offersWhenFired * 2)
    return rng
      .shuffle(nearest)
      .slice(0, BOARD.offersWhenFired)
      .map((c) => c.id)
  }
  const bigger = others.filter(
    (c) => c.reputation >= reputation + 3 && c.reputation <= reputation + 20,
  )
  return rng
    .shuffle(bigger)
    .slice(0, rng.int(0, BOARD.offersWhenGood))
    .map((c) => c.id)
}

/** The manager moves to another club: a fresh board, squad, books and market. */
export function takeJob(game: GameState, clubId: string): GameState {
  if (!game.career.jobOffers.includes(clubId)) throw new Error('Esse clube não fez proposta.')
  return {
    ...game,
    userClubId: clubId,
    userLineup: undefined,
    ledger: [],
    market: { ...game.market, listed: {}, offers: [], talks: {} },
    career: newCareer(game.world, clubId, game.career.history),
  }
}
