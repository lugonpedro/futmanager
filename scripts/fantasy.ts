/**
 * Plays seasons of the Brasileirão pack with nobody at the wheel and prints how
 * the fantasy points and prices behave, to tune `SCORING` and `PRICES`. Run
 * with `npm run fantasy -- 3`.
 */
import { readFileSync } from 'node:fs'
import { playerMatches, matchPoints } from '../src/engine/fantasy/scoring.ts'
import { PRICES, expectedPoints, nextPrice, startingPrice } from '../src/engine/fantasy/prices.ts'
import type { GameState, Position } from '../src/engine/model/types.ts'
import { POSITIONS } from '../src/engine/model/types.ts'
import { parsePackFile } from '../src/engine/pack/file.ts'
import {
  isSeasonOver,
  newGame,
  playMatchDayWithResults,
  startNextSeason,
} from '../src/engine/season/season.ts'

const seasons = Number(process.argv[2] ?? 3)
const seed = Number(process.argv[3] ?? 1)
const file = 'src/packs/brasileirao-2026.json'
const pack = parsePackFile(readFileSync(file, 'utf8'), file).pack

const average = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const fixed = (x: number, digits = 1) => x.toFixed(digits)
const quantile = (xs: readonly number[], q: number) => {
  const sorted = [...xs].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] ?? 0
}

type Appearance = { position: Position; price: number; points: number; minutes: number }

let game: GameState = newGame(seed, 'C1', pack)
for (let s = 0; s < seasons; s++) {
  const top = game.world.leagues.find((l) => l.division === 1)!
  const clubs = new Set(top.clubIds)
  const prices: Record<string, number> = {}
  for (const id of top.clubIds) {
    for (const playerId of game.world.clubs[id].playerIds) {
      prices[playerId] = startingPrice(game.world.players[playerId].overall)
    }
  }
  const startPrices = Object.values(prices)
  const recent: Record<string, number[]> = {}
  const season: Record<string, number> = {}
  const apps: Appearance[] = []
  const rounds: Record<string, number>[] = []

  while (!isSeasonOver(game.season)) {
    // Nobody manages the user's club, so the board's verdict is ignored.
    if (game.career.status !== 'empregado') {
      game = { ...game, career: { ...game.career, status: 'empregado', confidence: 50 } }
    }
    const played = playMatchDayWithResults(game)
    game = played.game
    if (played.day.kind !== 'liga') continue
    const points: Record<string, number> = {}
    for (const result of played.results) {
      if (!clubs.has(result.homeId)) continue
      for (const line of playerMatches(result)) {
        const p = matchPoints(line)
        points[line.playerId] = p
        if (line.minutes >= 1 && prices[line.playerId] !== undefined) {
          apps.push({
            position: line.position,
            price: prices[line.playerId],
            points: p,
            minutes: line.minutes,
          })
        }
      }
    }
    for (const [id, p] of Object.entries(points)) {
      season[id] = (season[id] ?? 0) + p
      if (prices[id] === undefined) continue
      ;(recent[id] ??= []).push(p)
      prices[id] = nextPrice(prices[id], recent[id])
    }
    rounds.push(points)
  }

  console.log(`\n== ${game.season.year}: ${rounds.length} rodadas, ${apps.length} participações ==`)
  console.log('pos  jogos  média  p10   p90   negativos  >=10')
  for (const position of POSITIONS) {
    const xs = apps.filter((a) => a.minutes >= 60 && a.position === position).map((a) => a.points)
    console.log(
      [
        position.padEnd(3),
        String(xs.length).padStart(5),
        fixed(average(xs)).padStart(6),
        fixed(quantile(xs, 0.1)).padStart(5),
        fixed(quantile(xs, 0.9)).padStart(5),
        fixed((100 * xs.filter((x) => x < 0).length) / Math.max(1, xs.length), 0).padStart(9) + '%',
        fixed((100 * xs.filter((x) => x >= 10).length) / Math.max(1, xs.length), 0).padStart(5) +
          '%',
      ].join(' '),
    )
  }

  console.log('preço      jogos  média  esperado  por posição (G Z L M A)')
  const bands = [0, 2, 4, 7, 11, 16, 99]
  for (let i = 0; i + 1 < bands.length; i++) {
    const inBand = apps.filter(
      (a) => a.minutes >= 60 && a.price >= bands[i] && a.price < bands[i + 1],
    )
    const mid = average(inBand.map((a) => a.price))
    const byPosition = POSITIONS.map((p) =>
      fixed(average(inBand.filter((a) => a.position === p).map((a) => a.points))),
    ).join(' ')
    console.log(
      `${String(bands[i]).padStart(2)}-${String(bands[i + 1]).padEnd(2)}    ${String(inBand.length).padStart(5)}  ${fixed(average(inBand.map((a) => a.points))).padStart(5)}  ${fixed(expectedPoints(mid)).padStart(8)}  ${byPosition}`,
    )
  }

  // Least squares of points on price, to check PRICES.expectedBase and expectedPerCoin.
  const full = apps.filter((a) => a.minutes >= 60)
  const mx = average(full.map((a) => a.price))
  const my = average(full.map((a) => a.points))
  const slope =
    full.reduce((s, a) => s + (a.price - mx) * (a.points - my), 0) /
    full.reduce((s, a) => s + (a.price - mx) ** 2, 0)
  console.log(
    `pontos ≈ ${fixed(my - slope * mx, 2)} + ${fixed(slope, 3)} × preço (hoje ${PRICES.expectedBase} + ${PRICES.expectedPerCoin})`,
  )

  const end = Object.values(prices)
  const describe = (xs: number[]) =>
    `${fixed(Math.min(...xs))} / ${fixed(quantile(xs, 0.5))} / ${fixed(quantile(xs, 0.9))} / ${fixed(Math.max(...xs))}`
  console.log(`preços mín/mediana/p90/máx: início ${describe(startPrices)}, fim ${describe(end)}`)

  const best = Object.entries(season)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([id, p]) => {
      const player = game.world.players[id]
      return `${player.name} (${player.position} ${player.overall}) ${fixed(p, 0)}`
    })
  console.log(`maiores pontuações: ${best.join(', ')}`)

  // A greedy best eleven each round in 4-3-3 with 100 coins, to see what a strong team scores.
  const shape: Record<Position, number> = { G: 1, Z: 2, L: 2, M: 3, A: 3 }
  const teams = rounds.map((points) => {
    let total = 0
    for (const position of POSITIONS) {
      const ids = Object.keys(points)
        .filter((id) => prices[id] !== undefined && game.world.players[id].position === position)
        .sort((a, b) => points[b] - points[a])
        .slice(0, shape[position])
      total += ids.reduce((t, id) => t + points[id], 0)
    }
    return total
  })
  console.log(`melhor 11 possível por rodada (sem orçamento): média ${fixed(average(teams))}`)

  game = startNextSeason(game)
}
