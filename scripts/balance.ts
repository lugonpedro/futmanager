/**
 * Plays many seasons with nobody at the wheel and prints how the world holds
 * up: ages, strength, squads, money, goals. Run with `npm run balance -- 50`.
 */
import { wageBill } from '../src/engine/finance/finance.ts'
import { FREE_AGENT, RETIRED, type GameState } from '../src/engine/model/types.ts'
import { cupWinner } from '../src/engine/season/cup.ts'
import {
  isSeasonOver,
  leagueStandings,
  newGame,
  playRound,
  seasonReview,
  startNextSeason,
} from '../src/engine/season/season.ts'

const seasons = Number(process.argv[2] ?? 50)
const seed = Number(process.argv[3] ?? 1)
const average = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const fixed = (x: number, digits = 1) => x.toFixed(digits)

let game: GameState = newGame(seed, 'C40')
console.log(
  'ano  idade forçaA topoA forçaB elenco gols casa empate campeão(rank rep) caixa(p10/mediana) negativos copa(div)',
)
for (let s = 0; s < seasons; s++) {
  while (!isSeasonOver(game.season)) {
    // Nobody manages the user's club, so the board's verdict is ignored.
    if (game.career.status !== 'empregado') {
      game = { ...game, career: { ...game.career, status: 'empregado', confidence: 50 } }
    }
    game = playRound(game)
  }
  const { world } = game
  const ai = Object.values(world.clubs).filter((c) => c.id !== game.userClubId)
  const active = Object.values(world.players).filter(
    (p) => p.clubId !== RETIRED && p.clubId !== FREE_AGENT,
  )
  const strengths = (division: number) =>
    ai
      .filter((c) => c.division === division)
      .flatMap((c) => c.playerIds.map((id) => world.players[id].strength))
  const top = [...strengths(1)].sort((a, b) => b - a).slice(0, 40)
  const played = Object.values(game.season.fixtures)
    .flat(2)
    .map((f) => f.result!)
  const share = (test: (r: (typeof played)[number]) => boolean) =>
    played.filter(test).length / played.length
  const cash = ai.map((c) => c.cash).sort((a, b) => a - b)
  const champion = leagueStandings(game, 'L1')[0].clubId
  const rank =
    [...world.leagues[0].clubIds]
      .sort((a, b) => world.clubs[b].reputation - world.clubs[a].reputation)
      .indexOf(champion) + 1
  const sizes = ai.map((c) => c.playerIds.length)
  console.log(
    [
      game.season.year,
      fixed(average(active.map((p) => p.age))),
      fixed(average(strengths(1))),
      fixed(average(top)),
      fixed(average(strengths(2))),
      `${Math.min(...sizes)}-${Math.max(...sizes)}`,
      fixed(average(played.map((r) => r.homeGoals + r.awayGoals)), 2),
      fixed(
        share((r) => r.homeGoals > r.awayGoals),
        2,
      ),
      fixed(
        share((r) => r.homeGoals === r.awayGoals),
        2,
      ),
      rank,
      `${fixed(cash[4] / 1e6)}/${fixed(cash[Math.floor(cash.length / 2)] / 1e6)} mi`,
      cash.filter((c) => c < 0).length,
      world.clubs[cupWinner(game.season.cup)!].division,
      `folha média ${fixed(average(ai.map((c) => wageBill(world, c))) / 1e6, 2)} mi/mês`,
    ].join('  '),
  )
  const review = seasonReview(game)
  game = startNextSeason(game, review.fired ? review.offers[0] : undefined)
}
