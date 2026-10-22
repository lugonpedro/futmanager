import { playMinute, replayMatch, type MatchReplay } from '../engine/match/simulate.ts'
import { PLAY_SPEEDS } from './matchSpeeds.ts'
import { playDuration } from './pitchScene.ts'

/**
 * A room's round shown live: everyone in the room sees the same minute of
 * every match at the same time, as on a broadcast. The replays are
 * deterministic, so every page works out the same timeline from them and
 * the time the round was played.
 */
export const LIVE = {
  /** The shortest play, as the "Normal" speed of the replays. */
  unitMs: PLAY_SPEEDS.Normal,
  /** From the round being played to the kick-off, for the pages to load it. */
  leadMs: 3_000,
  /** The break after the 45th minute. */
  halftimeMs: 8_000,
  /** How many times faster the round runs once everyone asked to speed it up. */
  fastFactor: 4,
}

/**
 * How far into the round's timeline the room is at `now`, in ms after
 * kick-off: real time, and `LIVE.fastFactor` times that from `spedAt` on.
 */
export function liveElapsed(kickOff: number, now: number, spedAt?: number): number {
  if (spedAt === undefined || now <= spedAt) return now - kickOff
  return spedAt - kickOff + (now - spedAt) * LIVE.fastFactor
}

/** How many times faster than normal the round is running at `now`. */
export const liveFactor = (now: number, spedAt?: number) =>
  spedAt !== undefined && now > spedAt ? LIVE.fastFactor : 1

/**
 * When each minute of the round is played, in milliseconds after kick-off,
 * and last the time the final plays have been acted out. A minute lasts as
 * long as the longest play of that minute across the matches, so they all
 * go at the same pace.
 */
export function roundTimeline(replays: readonly MatchReplay[]): number[] {
  const states = replays.map(replayMatch)
  const times: number[] = []
  let at = playDuration(undefined) * LIVE.unitMs
  while (states.some((s) => !s.finished)) {
    times.push(at)
    for (const state of states) playMinute(state)
    at += Math.max(...states.map((s) => playDuration(s.plays.at(-1)))) * LIVE.unitMs
    if (states[0].minute === 45) at += LIVE.halftimeMs
  }
  times.push(at)
  return times
}

/** How many minutes have been played `elapsed` ms after kick-off. */
export function minutesAt(timeline: readonly number[], elapsed: number): number {
  let minutes = 0
  while (minutes < timeline.length - 1 && timeline[minutes] <= elapsed) minutes++
  return minutes
}

/** Whether the round has been acted out to the end `elapsed` ms after kick-off. */
export const roundOver = (timeline: readonly number[], elapsed: number) =>
  elapsed >= timeline[timeline.length - 1]

/** Remembers, per room, the last round the player saw to the end (or skipped). */
const seenKey = (room: number) => `sala-${room}-rodada-vista`

export function seenRound(room: number): number {
  try {
    return Number(localStorage.getItem(seenKey(room)) ?? 0) || 0
  } catch {
    return 0
  }
}

export function markRoundSeen(room: number, round: number) {
  try {
    if (round > seenRound(room)) localStorage.setItem(seenKey(room), String(round))
  } catch {
    // Without storage the round is shown live again on the next visit, which is harmless.
  }
}
