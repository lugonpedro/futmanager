/**
 * Drafts and plays whole rooms of the Brasileirão pack with everyone on
 * automatic and prints what the plan asked to check (pesquisa/13-draft-online.md):
 * whether picking first decides the league, whether drafted teams make silly
 * scores, and how long starters stay injured. Run with `npm run room -- 200`.
 */
import { readFileSync } from 'node:fs'
import { generateWorld } from '../src/engine/generate/world.ts'
import { parsePackFile } from '../src/engine/pack/file.ts'
import { applyPack } from '../src/engine/pack/pack.ts'
import { advanceDraft, createRoom, roomPhase } from '../src/engine/room/draft.ts'
import {
  playRoomRound,
  roomStandings,
  roundLineup,
  startLeague,
} from '../src/engine/room/league.ts'
import { DEFAULT_ROOM_OPTIONS, type RoomTeam } from '../src/engine/room/types.ts'

const rooms = Number(process.argv[2] ?? 200)
const seed = Number(process.argv[3] ?? 1)
const file = 'src/packs/brasileirao-2026.json'
const pack = parsePackFile(readFileSync(file, 'utf8'), file).pack
const options = DEFAULT_ROOM_OPTIONS
const teams: RoomTeam[] = Array.from({ length: options.teams }, (_, i) => ({
  id: `T${i + 1}`,
  name: `Time ${i + 1}`,
  shortName: `T${i + 1}`,
  colors: { primary: '#000000', secondary: '#ffffff' },
  robot: true,
}))

const average = (xs: readonly number[]) => xs.reduce((a, b) => a + b, 0) / Math.max(1, xs.length)
const fixed = (x: number, digits = 1) => x.toFixed(digits)

const titlesByPick = Array<number>(options.teams).fill(0)
const placeByPick = Array.from({ length: options.teams }, () => [] as number[])
const goals: number[] = []
const bigWins: number[] = []
const starterOverall: number[] = []
let starterRoundsOut = 0
let starterRounds = 0

for (let r = 0; r < rooms; r++) {
  const roomSeed = seed * 100_003 + r
  const world = applyPack(generateWorld(roomSeed), pack).world
  let state = startLeague(
    advanceDraft(createRoom(roomSeed, world, teams, options), { auto: new Set(), queues: {} }),
  )
  // Each team's first XI as drafted, to count the rounds they miss.
  const firstXi = Object.fromEntries(
    state.teams.map((t) => [t.id, new Set(state.lineups[t.id].starters.map((s) => s.playerId))]),
  )
  for (const team of state.teams) {
    starterOverall.push(average([...firstXi[team.id]].map((id) => state.players[id].overall)))
  }
  while (roomPhase(state) === 'liga') {
    for (const team of state.teams) {
      const playing = new Set(roundLineup(state, team.id).starters.map((s) => s.playerId))
      starterRounds += firstXi[team.id].size
      starterRoundsOut += [...firstXi[team.id]].filter((id) => !playing.has(id)).length
    }
    const played = playRoomRound(state, roomSeed * 31 + state.round)
    for (const result of played.results) {
      goals.push(result.homeGoals + result.awayGoals)
      bigWins.push(Math.abs(result.homeGoals - result.awayGoals) >= 4 ? 1 : 0)
    }
    state = played.state
  }
  const table = roomStandings(state).map((row) => row.clubId)
  state.order.forEach((teamId, pick) => {
    const place = table.indexOf(teamId) + 1
    placeByPick[pick].push(place)
    if (place === 1) titlesByPick[pick]++
  })
}

console.log(
  `${rooms} salas de ${options.teams} times, elenco de ${options.squadSize}, todos no automático`,
)
console.log('escolha  títulos  colocação média')
for (let pick = 0; pick < options.teams; pick++) {
  console.log(
    `${String(pick + 1).padStart(7)}  ${fixed((100 * titlesByPick[pick]) / rooms).padStart(6)}%  ${fixed(average(placeByPick[pick]), 2).padStart(15)}`,
  )
}
console.log(`esperado por time: ${fixed(100 / options.teams)}% dos títulos`)
console.log(`geral médio dos titulares: ${fixed(average(starterOverall))}`)
console.log(
  `gols por jogo: ${fixed(average(goals), 2)}, goleadas (4+ de diferença): ${fixed(100 * average(bigWins))}%`,
)
console.log(
  `titulares do draft fora por rodada: ${fixed((100 * starterRoundsOut) / starterRounds)}% (lesão, suspensão ou escalação)`,
)
