import type { GameState } from '../engine/model/types.ts'
import { isSeasonOver, playRound } from '../engine/season/season.ts'

export type SimulateRequest = { id: number; game: GameState; rounds: number }
export type SimulateResponse = { id: number; game: GameState }

self.onmessage = (event: MessageEvent<SimulateRequest>) => {
  const { id, rounds } = event.data
  let { game } = event.data
  for (let i = 0; i < rounds && !isSeasonOver(game.season); i++) game = playRound(game)
  // The DOM typings describe window.postMessage; in a worker it takes just the message.
  ;(self as unknown as Worker).postMessage({ id, game } satisfies SimulateResponse)
}
