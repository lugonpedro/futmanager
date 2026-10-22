/**
 * Plays thousands of matches between sides of a set average and prints how
 * often the stronger one wins, draws and loses (docs/17-balanceamento-partidas.md).
 * Run with `npm run balance:match`, or `npm run balance:match -- 4000` for more games.
 */
import { generatePlayer } from '../src/engine/generate/player.ts'
import { autoLineup } from '../src/engine/match/lineup.ts'
import { simulateMatch, type MatchTeamInput } from '../src/engine/match/simulate.ts'
import type { Club, Player, Position } from '../src/engine/model/types.ts'
import { createRng } from '../src/engine/rng.ts'

const games = Number(process.argv[2] ?? 2000)
const SQUAD: Position[] = [
  'G',
  'G',
  'Z',
  'Z',
  'Z',
  'L',
  'L',
  'L',
  'M',
  'M',
  'M',
  'M',
  'M',
  'A',
  'A',
  'A',
]
/** Squads per level, so no one squad's quirks decide a line. */
const SQUADS = 4
const PAIRS: [number, number][] = [
  [90, 60],
  [90, 70],
  [80, 70],
  [80, 75],
  [78, 75],
]

const rng = createRng(7)
const players: Record<string, Player> = {}
let next = 0

/** A squad whose automatic XI averages within half a point of `level`. */
function side(level: number, id: string): MatchTeamInput {
  for (;;) {
    const squad = SQUAD.map((position) =>
      generatePlayer(rng, { id: `${id}-${next++}`, position, level, clubId: id, season: 2027 }),
    )
    const lineup = autoLineup(squad)
    const xi = lineup.starters.map((s) => squad.find((p) => p.id === s.playerId)!.overall)
    if (Math.abs(xi.reduce((a, b) => a + b, 0) / xi.length - level) >= 0.5) continue
    for (const p of squad) players[p.id] = p
    const club: Club = {
      id,
      name: id,
      shortName: id,
      city: '',
      colors: { primary: '#000000', secondary: '#ffffff' },
      reputation: 50,
      stadiumCapacity: 1,
      ticketPrice: 1,
      cash: 0,
      division: 1,
      playerIds: squad.map((p) => p.id),
    }
    return { club, lineup }
  }
}

const percent = (x: number) => `${Math.round((100 * x) / games)}%`.padStart(8)
console.log(`${games} jogos por confronto, mando alternado`)
console.log('forte x fraco   vitória  empate  derrota  gols/jogo')
for (const [strong, weak] of PAIRS) {
  const strongs = Array.from({ length: SQUADS }, (_, i) => side(strong, `F${strong}-${weak}-${i}`))
  const weaks = Array.from({ length: SQUADS }, (_, i) => side(weak, `R${strong}-${weak}-${i}`))
  let [won, drawn, lost, goals] = [0, 0, 0, 0]
  for (let i = 0; i < games; i++) {
    const [a, b] = [strongs[i % SQUADS], weaks[Math.floor(i / SQUADS) % SQUADS]]
    const home = i % 2 === 0
    const r = simulateMatch({ home: home ? a : b, away: home ? b : a, players }, rng)
    const [scored, conceded] = home ? [r.homeGoals, r.awayGoals] : [r.awayGoals, r.homeGoals]
    goals += scored + conceded
    if (scored > conceded) won++
    else if (scored === conceded) drawn++
    else lost++
  }
  console.log(
    `${strong} x ${weak}`.padEnd(13),
    percent(won),
    percent(drawn),
    percent(lost),
    (goals / games).toFixed(2).padStart(10),
  )
}
