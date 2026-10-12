import type { GameState } from '../engine/model/types.ts'
import {
  advanceToNextGame,
  canPlayRound,
  playMatchDay,
  playNextGame,
} from '../engine/season/season.ts'

/** advance: to the user's next game; play: and play it; season: every game left. */
export type SimulateAction = 'advance' | 'play' | 'season'
export type SimulateRequest = { id: number; game: GameState; action: SimulateAction }
export type SimulateResponse = { id: number; game: GameState }

function run(game: GameState, action: SimulateAction): GameState {
  if (action === 'advance') return advanceToNextGame(game)
  if (action === 'play') return playNextGame(game)
  let next = game
  while (canPlayRound(next)) next = playMatchDay(next)
  return next
}

self.onmessage = (event: MessageEvent<SimulateRequest>) => {
  const { id, game, action } = event.data
  // The DOM typings describe window.postMessage; in a worker it takes just the message.
  ;(self as unknown as Worker).postMessage({
    id,
    game: run(game, action),
  } satisfies SimulateResponse)
}
