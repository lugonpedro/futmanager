import type { Club, League, Player, Position, World } from '../model/types.ts'
import { createRng, type Rng } from '../rng.ts'
import { allCityNames, CLUB_COLORS, clubName, shortNameCandidates } from './names.ts'
import { generatePlayer } from './player.ts'

export const CLUBS_PER_DIVISION = 20

/** 25 players: enough to field a 4-4-2 or 4-3-3 twice over with injuries and bans. */
export const SQUAD_SHAPE: Record<Position, number> = { G: 3, Z: 5, L: 4, M: 7, A: 6 }

const DIVISIONS = [
  { name: 'Série A', reputation: { top: 85, bottom: 50 } },
  { name: 'Série B', reputation: { top: 60, bottom: 30 } },
]

const roundTo = (value: number, step: number) => Math.round(value / step) * step

function generateClub(
  rng: Rng,
  id: string,
  city: string,
  reputation: number,
  division: number,
  shortName: string,
): Club {
  return {
    id,
    name: clubName(rng, city),
    shortName,
    city,
    colors: rng.pick(CLUB_COLORS),
    reputation,
    stadiumCapacity: roundTo(5000 + reputation * 600 * (0.7 + rng.next() * 0.6), 500),
    cash: roundTo(reputation ** 2 * 1000 * (0.5 + rng.next()), 10000),
    division,
    playerIds: [],
  }
}

/** Builds a fresh, fully fictional football world. Same seed, same world. */
export function generateWorld(seed: number, season = 2027): World {
  const rng = createRng(seed)
  const cities = rng.shuffle(allCityNames())
  const clubs: Record<string, Club> = {}
  const players: Record<string, Player> = {}
  const leagues: League[] = []
  const usedShortNames = new Set<string>()
  let playerCount = 0

  DIVISIONS.forEach((divisionInfo, index) => {
    const division = index + 1
    const { top, bottom } = divisionInfo.reputation
    const league: League = { id: `L${division}`, name: divisionInfo.name, division, clubIds: [] }

    for (let rank = 0; rank < CLUBS_PER_DIVISION; rank++) {
      const clubId = `C${leagues.length * CLUBS_PER_DIVISION + rank + 1}`
      // Spread reputations from the division's top to its bottom, with a little noise.
      const base = top - ((top - bottom) * rank) / (CLUBS_PER_DIVISION - 1)
      const reputation = Math.min(99, Math.max(1, Math.round(base + rng.normal(0, 3))))
      const city = cities.pop()!
      const shortName =
        shortNameCandidates(city).find((code) => !usedShortNames.has(code)) ?? clubId
      usedShortNames.add(shortName)
      const club = generateClub(rng, clubId, city, reputation, division, shortName)

      for (const [position, count] of Object.entries(SQUAD_SHAPE) as [Position, number][]) {
        for (let i = 0; i < count; i++) {
          const player = generatePlayer(rng, {
            id: `P${++playerCount}`,
            clubId,
            position,
            level: reputation,
            season,
          })
          players[player.id] = player
          club.playerIds.push(player.id)
        }
      }

      clubs[clubId] = club
      league.clubIds.push(clubId)
    }

    leagues.push(league)
  })

  return { seed, season, leagues, clubs, players }
}
