import { useEffect, useState } from 'react'
import type { MatchState, Play } from '../engine/match/simulate.ts'
import { movingShare, playDuration } from './pitchScene.ts'

/**
 * The score to show above the pitch: a goal counts once the ball is in the
 * net, not when the minute starts, so the scoreboard and the picture agree.
 * `flash` is true while the new score should blink.
 */
export function useShownScore(state: MatchState | undefined, onPitch: boolean, unitMs: number) {
  const play = state?.plays.at(-1)
  const goal = onPitch && play?.end === 'goal' && !state?.finished ? play : undefined
  const [revealed, setRevealed] = useState<Play>()
  useEffect(() => {
    if (!goal) return
    const timer = setTimeout(
      () => setRevealed(goal),
      playDuration(goal) * unitMs * movingShare(goal),
    )
    return () => clearTimeout(timer)
  }, [goal, unitMs])
  const hidden = goal && revealed !== goal ? goal.side : undefined
  if (!state) return { home: 0, away: 0, flash: false }
  return {
    home: state.home.stats.goals - (hidden === 'home' ? 1 : 0),
    away: state.away.stats.goals - (hidden === 'away' ? 1 : 0),
    flash: state.events.some((e) => e.type === 'gol' && e.minute === state.minute) && !hidden,
  }
}
