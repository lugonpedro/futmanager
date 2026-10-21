import { describe, expect, it } from 'vitest'
import { advanceDraft } from '../engine/room/draft.ts'
import { startDraft } from '../engine/room/start.ts'
import { leagueFromDraft, playSavedRound } from '../engine/room/summary.ts'
import { DEFAULT_ROOM_OPTIONS } from '../engine/room/types.ts'
import { BUILT_IN_PACKS } from '../packs/index.ts'
import { LIVE, minutesAt, roundOver, roundTimeline } from './liveRound.ts'

const pack = await BUILT_IN_PACKS[0].load()
const options = { ...DEFAULT_ROOM_OPTIONS, teams: 8, legs: 1 as const }
const { state } = startDraft(6, pack, [], options)
const league = leagueFromDraft(state, advanceDraft(state, { auto: new Set(), queues: {} }).picks)
const { replays } = playSavedRound(league, {}, 3)

describe('roundTimeline', () => {
  const timeline = roundTimeline(replays)

  it('has a time for every minute and one for the end, always going forward', () => {
    expect(replays).toHaveLength(4)
    expect(timeline).toHaveLength(91)
    for (let i = 1; i < timeline.length; i++) expect(timeline[i]).toBeGreaterThan(timeline[i - 1])
  })

  it('stops for half-time after the 45th minute', () => {
    expect(timeline[45] - timeline[44]).toBeGreaterThanOrEqual(LIVE.halftimeMs + LIVE.unitMs)
  })

  it('lasts a few minutes, and the same on every page', () => {
    expect(timeline[90]).toBeGreaterThan(60_000)
    expect(timeline[90]).toBeLessThan(5 * 60_000)
    expect(roundTimeline(replays)).toEqual(timeline)
  })

  it('tells how many minutes have been played and when it is over', () => {
    expect(minutesAt(timeline, 0)).toBe(0)
    expect(minutesAt(timeline, timeline[0])).toBe(1)
    expect(minutesAt(timeline, timeline[10] - 1)).toBe(10)
    expect(minutesAt(timeline, timeline[90] + 1)).toBe(90)
    expect(roundOver(timeline, timeline[90] - 1)).toBe(false)
    expect(roundOver(timeline, timeline[90])).toBe(true)
  })
})
