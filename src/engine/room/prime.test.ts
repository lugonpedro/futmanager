import { describe, expect, it } from 'vitest'
import { generateWorld } from '../generate/world.ts'
import migration from '../../../supabase/migrations/20261106000000_cartas_prime.sql?raw'
import { advanceDraft, createRoom } from './draft.ts'
import { primePlayer, PRIME } from './prime.ts'
import { leagueFromDraft } from './summary.ts'
import { DEFAULT_ROOM_OPTIONS, type RoomTeam } from './types.ts'

const world = generateWorld(11)
const teams: RoomTeam[] = Array.from({ length: 4 }, (_, i) => ({
  id: String(i),
  name: `Time ${i + 1}`,
  shortName: `T${i + 1}`,
  colors: { primary: '#000000', secondary: '#ffffff' },
  robot: true,
}))

describe('prime cards', () => {
  const player = Object.values(world.players).find((p) => p.overall < 60)!

  it('raises every attribute and the overall by the boost', () => {
    const primed = primePlayer(player, 10)
    expect(primed.overall).toBe(player.overall + 10)
    expect(primed.potential).toBeGreaterThanOrEqual(primed.overall)
    for (const [name, value] of Object.entries(player.attributes)) {
      expect(primed.attributes[name as keyof typeof player.attributes]).toBe(
        Math.min(99, value + 10),
      )
    }
    expect(primePlayer(player, 0)).toBe(player)
  })

  it('keeps the boost of a prime pick in the league', () => {
    const start = createRoom(5, world, teams, { ...DEFAULT_ROOM_OPTIONS, teams: 4 })
    const drafted = advanceDraft(start, { auto: new Set(), queues: {} })
    const [first, ...rest] = drafted.picks
    const league = leagueFromDraft(start, [{ ...first, prime: 9 }, ...rest])
    const before = start.players[first.playerId]
    expect(league.players[first.playerId].overall).toBe(Math.min(99, before.overall + 9))
    expect(league.players[rest[0].playerId].overall).toBe(start.players[rest[0].playerId].overall)
  })

  it('uses the numbers the database draws with', () => {
    expect(migration).toContain(`random() * ${PRIME.oneIn} < 1`)
    expect(migration).toContain(`limit ${PRIME.amongWeakest}`)
    expect(migration).toContain(
      `${PRIME.boost[0]} + floor(random() * ${PRIME.boost[1] - PRIME.boost[0] + 1})`,
    )
    expect(migration).toContain(`${PRIME.ceiling} - `)
  })
})
