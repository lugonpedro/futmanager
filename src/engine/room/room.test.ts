import { describe, expect, it } from 'vitest'
import { generateWorld } from '../generate/world.ts'
import { FREE_AGENT } from '../model/types.ts'
import { addDays } from '../season/calendar.ts'
import {
  advanceDraft,
  autoPick,
  checkPick,
  createRoom,
  makePick,
  roomPhase,
  squadShape,
  teamForPick,
  teamOnTheClock,
  totalPicks,
} from './draft.ts'
import { checkLineup, playRoomRound, roomStandings, startLeague, unavailableOn } from './league.ts'
import {
  applyTrade,
  checkTrade,
  claimOrder,
  releasePlayer,
  resolveClaims,
  tradesOpen,
} from './market.ts'
import { DEFAULT_ROOM_OPTIONS, type RoomOptions, type RoomTeam } from './types.ts'

const world = generateWorld(11)
const teams = (count: number, people = 0): RoomTeam[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `T${i + 1}`,
    name: `Time ${i + 1}`,
    shortName: `T${i + 1}`,
    colors: { primary: '#000000', secondary: '#ffffff' },
    robot: i >= people,
  }))
/** The options these tests were written against, kept apart from the defaults the app offers. */
const BASE: RoomOptions = {
  ...DEFAULT_ROOM_OPTIONS,
  squadSize: 18,
  draftOrder: 'serpentina',
  trades: 'ate-dois-tercos',
}
const room = (options: Partial<RoomOptions> = {}, people = 0) => {
  const merged = { ...BASE, ...options }
  return createRoom(5, world, teams(merged.teams, people), merged)
}
const NO_AUTO = { auto: new Set<string>(), queues: {} }
const drafted = (options: Partial<RoomOptions> = {}) => advanceDraft(room(options), NO_AUTO)

describe('draft', () => {
  it('goes in snake order', () => {
    const order = ['A', 'B', 'C']
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => teamForPick(order, n))).toEqual([
      'A',
      'B',
      'C',
      'C',
      'B',
      'A',
      'A',
    ])
  })

  it("can play the third round in the second round's order", () => {
    const order = ['A', 'B', 'C']
    const picks = Array.from({ length: 12 }, (_, n) => teamForPick(order, n, 'terceira-invertida'))
    expect(picks.join('')).toBe('ABCCBACBAABC')
  })

  it('draws the same order from the same seed', () => {
    expect(room().order).toEqual(room().order)
    expect([...room().order].sort()).toEqual(teams(8).map((t) => t.id))
  })

  it('shapes squads with at least two keepers', () => {
    for (const size of [16, 18, 20]) {
      const shape = squadShape(size)
      expect(Object.values(shape).reduce((a, b) => a + b, 0)).toBe(size)
      expect(shape.G).toBeGreaterThanOrEqual(2)
    }
  })

  it('lets robots draft whole squads, each player once, with two keepers each', () => {
    const state = drafted()
    expect(state.picks).toHaveLength(totalPicks(state))
    const ids = state.picks.map((p) => p.playerId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const team of state.teams) {
      const squad = state.squads[team.id]
      expect(squad).toHaveLength(18)
      expect(
        squad.filter((id) => state.players[id].position === 'G').length,
      ).toBeGreaterThanOrEqual(2)
      expect(squad.every((id) => state.players[id].clubId === team.id)).toBe(true)
    }
    // The first pick is the best player of the world.
    const best = Object.values(world.players).sort((a, b) => b.overall - a.overall)[0]
    expect(state.picks[0].playerId).toBe(best.id)
  })

  it('stops at a person and refuses wrong picks', () => {
    const start = room({}, 8)
    expect(advanceDraft(start, NO_AUTO)).toBe(start)
    const team = teamOnTheClock(start)!
    const other = start.order[1]
    const player = autoPick(start, team)
    expect(checkPick(start, other, player)).toMatch(/vez/)
    expect(checkPick(start, team, player)).toBeUndefined()
  })

  it('takes from the queue first, skipping who is gone', () => {
    const start = room({}, 8)
    const team = teamOnTheClock(start)!
    const keepers = Object.values(start.players).filter((p) => p.position === 'G')
    const queue = ['nobody', keepers[3].id]
    expect(autoPick(start, team, queue)).toBe(keepers[3].id)
  })

  it('refuses a pick that leaves no room for the second keeper', () => {
    let state = room({ teams: 2, squadSize: 16 }, 2)
    const team = state.order[0]
    const freeOutfield = () =>
      Object.values(state.players).find((p) => p.clubId === FREE_AGENT && p.position !== 'G')!
    // One team takes outfielders only until two picks are left.
    while (state.squads[team].length < 14 || teamOnTheClock(state) !== team) {
      const onClock = teamOnTheClock(state)!
      const id = onClock === team ? freeOutfield().id : autoPick(state, onClock)
      state = makePick(state, onClock, id)
    }
    expect(checkPick(state, team, freeOutfield().id)).toMatch(/goleiros/)
    expect(autoPick(state, team)).toSatisfy((id: string) => state.players[id].position === 'G')
  })

  it('takes the reserves by overall, among the positions still short', () => {
    let state = room({ teams: 2, squadSize: 16 }, 2)
    const team = state.order[0]
    // The team fills its eleven with forwards and keepers only.
    while (state.squads[team].length < 11 || teamOnTheClock(state) !== team) {
      const onClock = teamOnTheClock(state)!
      const keepers = state.squads[team].filter((id) => state.players[id].position === 'G')
      const wanted = keepers.length < 2 ? 'G' : 'A'
      const id =
        onClock === team
          ? Object.values(state.players)
              .filter((p) => p.clubId === FREE_AGENT && p.position === wanted)
              .sort((a, b) => b.overall - a.overall)[0].id
          : autoPick(state, onClock)
      state = makePick(state, onClock, id)
    }
    const shape = squadShape(16)
    const picked = state.players[autoPick(state, team)]
    expect(['G', 'A']).not.toContain(picked.position)
    const best = Object.values(state.players)
      .filter((p) => p.clubId === FREE_AGENT && p.position !== 'G' && p.position !== 'A')
      .filter((p) => checkPick(state, team, p.id) === undefined)
      .sort((a, b) => b.overall - a.overall || a.id.localeCompare(b.id))[0]
    expect(shape[picked.position]).toBeGreaterThan(0)
    expect(picked.id).toBe(best.id)
  })

  it('lets the reserves come from the queue when asked', () => {
    const start = room({ teams: 2, autoReserves: true }, 2)
    let state = start
    // People make their first 11 picks by hand.
    while (Object.values(state.squads).some((s) => s.length < 11)) {
      const team = teamOnTheClock(state)!
      state = advanceDraft(makePick(state, team, autoPick(state, team)), NO_AUTO)
    }
    expect(roomPhase(state)).toBe('draft')
    expect(state.picks).toHaveLength(totalPicks(state))
  })
})

describe('league', () => {
  const league = (options: Partial<RoomOptions> = {}) => startLeague(drafted(options))

  it('plays every team against every other, home and away, a week apart', () => {
    const state = league()
    expect(roomPhase(state)).toBe('liga')
    expect(state.fixtures).toHaveLength(14)
    const pairs = state.fixtures.flat().map((f) => `${f.homeId}>${f.awayId}`)
    expect(new Set(pairs).size).toBe(56)
    expect(state.fixtures[1][0].date > state.fixtures[0][0].date).toBe(true)
  })

  it('follows the number of legs', () => {
    expect(league({ legs: 1 }).fixtures).toHaveLength(7)
    const three = league({ legs: 3 })
    expect(three.fixtures).toHaveLength(21)
    expect(new Set(three.fixtures.flat().map((f) => f.id)).size).toBe(84)
    const four = league({ legs: 4 })
    expect(four.fixtures).toHaveLength(28)
    const pairs = (round: number) => four.fixtures[round].map((f) => [f.homeId, f.awayId])
    expect(pairs(14)).toEqual(pairs(0))
    expect(new Set(four.fixtures.flat().map((f) => f.id)).size).toBe(112)
  })

  it('plays a whole league the same way from the same seeds', () => {
    const play = () => {
      let state = league({ teams: 4 })
      while (roomPhase(state) === 'liga') state = playRoomRound(state, state.round * 7).state
      return state
    }
    const a = play()
    const b = play()
    expect(roomPhase(a)).toBe('encerrada')
    expect(a.fixtures.flat().every((f) => f.result)).toBe(true)
    expect(roomStandings(a)).toEqual(roomStandings(b))
    expect(roomStandings(a)[0].played).toBe(6)
  })

  it('keeps the banned and the injured out of the next round', () => {
    let state = league()
    for (let i = 0; i < 6; i++) {
      const before = state
      const out = unavailableOn(before, before.today)
      const { state: after, replays } = playRoomRound(before, 100 + i)
      for (const r of replays) {
        for (const side of [r.input.home, r.input.away]) {
          for (const slot of side.lineup.starters) expect(out.has(slot.playerId)).toBe(false)
        }
      }
      state = after
    }
    expect(Object.keys(state.ratings).length).toBeGreaterThan(100)
  })

  it('has no injuries with the option off, and short ones when asked', () => {
    let off = league({ injuries: 'desligadas' })
    let short = league({ injuries: 'curtas' })
    for (let i = 0; i < 8; i++) {
      off = playRoomRound(off, i).state
      short = playRoomRound(short, i).state
      expect(off.discipline.injuries).toEqual({})
      for (const back of Object.values(short.discipline.injuries)) {
        expect(back <= addDays(short.fixtures[i][0].date, 14)).toBe(true)
      }
    }
  })

  it('checks a lineup against the squad', () => {
    const state = league()
    const team = state.teams[0].id
    expect(checkLineup(state, team, state.lineups[team])).toBeUndefined()
    const other = state.lineups[state.teams[1].id]
    expect(checkLineup(state, team, other)).toMatch(/elenco/)
  })

  it('takes a role picked from the part of the pitch of the slot, and nothing else', () => {
    const state = startLeague(drafted())
    const team = state.teams[0].id
    const lineup = state.lineups[team]
    const forward = lineup.starters.findIndex((s) => s.position === 'A')
    const withDuty = (duty: string) => ({
      ...lineup,
      starters: lineup.starters.map((s, i) => (i === forward ? { ...s, duty } : s)),
    })
    expect(checkLineup(state, team, withDuty('F9') as typeof lineup)).toBeUndefined()
    expect(checkLineup(state, team, withDuty('ZAG') as typeof lineup)).toMatch(/Posição/)
    expect(checkLineup(state, team, withDuty('XYZ') as typeof lineup)).toMatch(/Posição/)
  })
})

describe('market', () => {
  const league = (options: Partial<RoomOptions> = {}) => startLeague(drafted(options))

  it('serves the worst first, one claim at a time, two at most', () => {
    const state = playRoomRound(league(), 1).state
    const order = claimOrder(state)
    expect(order[0]).toBe(roomStandings(state).at(-1)!.clubId)
    const free = Object.values(state.players)
      .filter((p) => p.clubId === FREE_AGENT && p.position === 'A')
      .sort((a, b) => b.overall - a.overall)
    const [first, second] = order
    const outfield = (team: string) =>
      state.squads[team].filter((id) => state.players[id].position !== 'G')
    const claims = [
      // Both want the best free forward; the worst placed gets him.
      { teamId: second, playerId: free[0].id, releaseId: outfield(second)[0] },
      { teamId: first, playerId: free[0].id, releaseId: outfield(first)[0] },
      { teamId: first, playerId: free[1].id, releaseId: outfield(first)[1] },
      { teamId: first, playerId: free[2].id, releaseId: outfield(first)[2] },
    ]
    const { state: after, granted, refused } = resolveClaims(state, claims)
    expect(granted.map((c) => c.playerId)).toEqual([free[0].id, free[1].id])
    expect(refused).toHaveLength(2)
    expect(after.squads[first]).toContain(free[0].id)
    expect(after.squads[first]).toHaveLength(18)
    expect(after.players[outfield(first)[0]].clubId).toBe(FREE_AGENT)
  })

  it('does not let a released player be claimed in the same window', () => {
    const state = league()
    const team = state.teams[0].id
    const out = state.squads[team].find((id) => state.players[id].position === 'A')!
    const released = releasePlayer(state, team, out)
    expect(released.squads[team]).toHaveLength(17)
    const other = state.teams[1].id
    const claim = { teamId: other, playerId: out, releaseId: released.squads[other][5] }
    expect(resolveClaims(released, [claim]).granted).toHaveLength(0)
    const later = playRoomRound(released, 3).state
    expect(resolveClaims(later, [claim]).granted).toHaveLength(1)
  })

  it('trades the same number each way and keeps two keepers', () => {
    const state = league()
    const [a, b] = state.teams.map((t) => t.id)
    const keeperA = state.squads[a].filter((id) => state.players[id].position === 'G')
    const outfieldB = state.squads[b].filter((id) => state.players[id].position !== 'G')
    expect(checkTrade(state, { fromId: a, toId: b, give: keeperA.slice(0, 1), take: [] })).toMatch(
      /mesmo número/,
    )
    if (keeperA.length === 2) {
      expect(
        checkTrade(state, {
          fromId: a,
          toId: b,
          give: keeperA.slice(0, 1),
          take: outfieldB.slice(0, 1),
        }),
      ).toMatch(/goleiros/)
    }
    const giveA = state.squads[a].filter((id) => state.players[id].position !== 'G').slice(0, 2)
    const trade = { fromId: a, toId: b, give: giveA, take: outfieldB.slice(0, 2) }
    const after = applyTrade(state, trade)
    expect(after.squads[b]).toEqual(expect.arrayContaining(giveA))
    expect(after.players[giveA[0]].clubId).toBe(b)
  })

  it('closes trades after two thirds of the league, or never opens them', () => {
    let state = league({ teams: 4 })
    expect(tradesOpen(state)).toBe(true)
    for (let i = 0; i < 4; i++) state = playRoomRound(state, i).state
    expect(state.round).toBe(5)
    expect(tradesOpen(state)).toBe(false)
    expect(tradesOpen(league({ trades: 'desligadas' }))).toBe(false)
  })
})
