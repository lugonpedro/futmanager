/**
 * Writes the overall of every player in the Brasileirão pack from the
 * reference ratings in brasileirao-2026-notas.txt. Those follow a scale like
 * EA FC's, where everyone sits between 50 and 85; the game spreads clubs and
 * players much wider, so each rating is stretched in two steps: the club's
 * average moves to where a generated club of its division would be, and the
 * player keeps his distance from that average, also stretched. Run with
 * `npm run pack:ratings`.
 */
import { readFileSync, writeFileSync } from 'node:fs'

const PACK = new URL('../src/packs/brasileirao-2026.json', import.meta.url)
const RATINGS = new URL('../src/packs/brasileirao-2026-notas.txt', import.meta.url)
const CLUBS_PER_DIVISION = 20

/** A generated world's divisions: average player and spread of club averages. */
const GAME = [
  { mean: 67.2, clubSpread: 10.5 },
  { mean: 45.3, clubSpread: 9.0 },
]
/** How much wider a player's distance from his club's average gets. */
const PLAYER_STRETCH = 2

const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length
const spread = (xs: number[]) => Math.sqrt(average(xs.map((x) => (x - average(xs)) ** 2)))

type PackFile = { clubes: { nome: string; jogadores: { overall?: number }[] }[] }
const pack = JSON.parse(readFileSync(PACK, 'utf8')) as PackFile

const ratings = new Map<string, number[]>()
for (const line of readFileSync(RATINGS, 'utf8').split('\n')) {
  if (!line.trim() || line.startsWith('#')) continue
  const [club, values] = line.split(':')
  ratings.set(club.trim(), values.trim().split(/\s+/).map(Number))
}

const clubRatings = pack.clubes.map((club) => {
  const values = ratings.get(club.nome)
  if (!values || values.length !== club.jogadores.length) {
    throw new Error(
      `${club.nome}: ${values?.length ?? 0} notas para ${club.jogadores.length} jogadores`,
    )
  }
  return values
})

GAME.forEach((game, division) => {
  const clubs = clubRatings.slice(
    division * CLUBS_PER_DIVISION,
    (division + 1) * CLUBS_PER_DIVISION,
  )
  const means = clubs.map(average)
  const clubStretch = game.clubSpread / spread(means)
  clubs.forEach((values, i) => {
    const club = pack.clubes[division * CLUBS_PER_DIVISION + i]
    const clubMean = game.mean + (means[i] - average(means)) * clubStretch
    club.jogadores.forEach((player, j) => {
      const overall = clubMean + (values[j] - means[i]) * PLAYER_STRETCH
      player.overall = Math.min(99, Math.max(1, Math.round(overall)))
    })
  })
})

writeFileSync(PACK, JSON.stringify(pack, null, 2) + '\n')
console.log(`Notas gravadas em ${pack.clubes.length} clubes.`)
