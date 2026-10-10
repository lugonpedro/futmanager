import type { GameState } from '../engine/model/types.ts'
import type { SimulateRequest, SimulateResponse } from './season.worker.ts'

let worker: Worker | undefined
let nextId = 0
const pending = new Map<number, (game: GameState) => void>()

/** Plays up to `rounds` rounds off the main thread, so the screen never freezes. */
export function simulateRounds(game: GameState, rounds: number): Promise<GameState> {
  if (!worker) {
    worker = new Worker(new URL('./season.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<SimulateResponse>) => {
      pending.get(event.data.id)?.(event.data.game)
      pending.delete(event.data.id)
    }
  }
  const id = nextId++
  return new Promise((resolve) => {
    pending.set(id, resolve)
    worker!.postMessage({ id, game, rounds } satisfies SimulateRequest)
  })
}
