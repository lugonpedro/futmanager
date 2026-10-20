import type {
  Fixture,
  MatchResult,
  Player,
  PlayerSeason,
  Position,
  RoundStar,
  Season,
  World,
} from '../model/types.ts'
import { daysBetween, type GameDate } from './calendar.ts'
import { topScorers } from './standings.ts'

/** Energy a player gets back each day after a match: this much, plus up to as much again with stamina. */
export const RECOVERY_PER_DAY = 4

/**
 * How fresh a player is on a given day, out of 100: what his last match left,
 * plus rest since, `recovery` times as quick as usual.
 */
export function conditionOn(
  season: Pick<Season, 'fitness'>,
  player: Player,
  date: GameDate,
  recovery = 1,
): number {
  const last = season.fitness[player.id]
  if (!last) return 100
  const perDay = RECOVERY_PER_DAY * (1 + player.attributes.stamina / 100) * recovery
  return Math.min(100, Math.round(last.energy + perDay * Math.max(0, daysBetween(last.date, date))))
}

/** Ratings this many back count towards form. */
export const FORM_GAMES = 5
/** A rating of this is average form; every so many points either side is a step. */
const FORM_CENTER = 6.2
const FORM_STEP = 0.45

/** Form from -2 to +2, from the last five ratings; nothing to go on yet is 0. */
export function formOf(season: Pick<Season, 'ratings'>, playerId: string): number {
  const last = season.ratings[playerId]?.last ?? []
  if (last.length < 2) return 0
  const average = last.reduce((a, b) => a + b, 0) / last.length
  return Math.max(-2, Math.min(2, Math.round((average - FORM_CENTER) / FORM_STEP)))
}

/** Average rating this season, if he has played. */
export function seasonRating(
  season: Pick<Season, 'ratings'>,
  playerId: string,
): number | undefined {
  const ratings = season.ratings[playerId]
  return ratings && ratings.games > 0
    ? Math.round((10 * ratings.total) / ratings.games) / 10
    : undefined
}

/** Ratings and tiredness from a match day go into the season's records. */
export function recordMatchDay(
  season: Pick<Season, 'fitness' | 'ratings'>,
  results: readonly MatchResult[],
  date: GameDate,
): Pick<Season, 'fitness' | 'ratings'> {
  const fitness = { ...season.fitness }
  const ratings = { ...season.ratings }
  for (const result of results) {
    for (const [id, energy] of Object.entries(result.energy)) fitness[id] = { energy, date }
    for (const [id, rating] of Object.entries(result.ratings)) {
      const before = ratings[id] ?? { games: 0, total: 0, last: [] }
      ratings[id] = {
        games: before.games + 1,
        total: Math.round(10 * (before.total + rating)) / 10,
        last: [...before.last, rating].slice(-FORM_GAMES),
      }
    }
  }
  return { fitness, ratings }
}

/** Shape of the best XI of a round: 4-3-3. */
const STARS_SHAPE: Record<Position, number> = { G: 1, Z: 2, L: 2, M: 3, A: 3 }

/**
 * The best rated players in each place of a 4-3-3, from every match of a
 * round, listed from the keeper forwards.
 */
export function roundStars(
  results: readonly MatchResult[],
  players: Readonly<Record<string, Player>>,
): RoundStar[] {
  const rated = results
    .flatMap((r) => Object.entries(r.ratings))
    .sort(([a, x], [b, y]) => y - x || a.localeCompare(b))
  const goals = (id: string) =>
    results.reduce(
      (sum, r) => sum + r.events.filter((e) => e.type === 'gol' && e.playerId === id).length,
      0,
    )
  // A save is told from the shooter's side, so the keeper's are the other side's saved shots.
  const saves = (id: string) => {
    const clubId = players[id].clubId
    const match = results.find((r) => r.homeId === clubId || r.awayId === clubId)
    return match?.events.filter((e) => e.type === 'defesa' && e.clubId !== clubId).length ?? 0
  }
  const stars: Record<Position, RoundStar[]> = { G: [], Z: [], L: [], M: [], A: [] }
  for (const [playerId, rating] of rated) {
    const position = players[playerId]?.position
    if (!position || stars[position].length >= STARS_SHAPE[position]) continue
    stars[position].push({
      playerId,
      rating,
      goals: goals(playerId),
      saves: position === 'G' ? saves(playerId) : 0,
    })
  }
  return (Object.keys(STARS_SHAPE) as Position[]).flatMap((position) => stars[position])
}

/** Played at least this share of the league rounds to be the player of the season. */
const BEST_PLAYER_SHARE = 0.5

/** The player of the season among a league's clubs: best average rating among the regulars. */
export function bestPlayer(
  world: World,
  season: Season,
  clubIds: readonly string[],
): { playerId: string; clubId: string; rating: number } | undefined {
  let best: { playerId: string; clubId: string; rating: number } | undefined
  for (const clubId of clubIds) {
    for (const playerId of world.clubs[clubId].playerIds) {
      const ratings = season.ratings[playerId]
      if (!ratings || ratings.games < season.totalRounds * BEST_PLAYER_SHARE) continue
      const rating = Math.round((100 * ratings.total) / ratings.games) / 100
      if (!best || rating > best.rating) best = { playerId, clubId, rating }
    }
  }
  return best && { ...best, rating: Math.round(10 * best.rating) / 10 }
}

/** Adds the season just played to every player's record, if he played. */
export function recordSeasonHistory(world: World, season: Season): World {
  const fixtures: Fixture[] = [
    ...Object.values(season.fixtures).flat(2),
    ...(season.cup?.stages.flatMap((s) => s.ties) ?? []),
  ]
  const goals = new Map(topScorers(fixtures).map((row) => [row.playerId, row.goals]))
  const players = { ...world.players }
  for (const [id, ratings] of Object.entries(season.ratings)) {
    const player = players[id]
    if (!player || ratings.games === 0) continue
    const entry: PlayerSeason = {
      year: season.year,
      clubId: player.clubId,
      games: ratings.games,
      goals: goals.get(id) ?? 0,
      rating: Math.round((10 * ratings.total) / ratings.games) / 10,
    }
    players[id] = { ...player, history: [...(player.history ?? []), entry] }
  }
  return { ...world, players }
}
