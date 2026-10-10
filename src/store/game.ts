import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { GameState } from '../engine/model/types.ts'

type GameStore = {
  game?: GameState
  setGame: (game: GameState | undefined) => void
}

/**
 * The running career. Kept in localStorage so a reload doesn't lose it; proper
 * save slots in IndexedDB come with the saves stage.
 */
export const useGameStore = create<GameStore>()(
  persist(
    (set) => ({
      game: undefined,
      setGame: (game) => set({ game }),
    }),
    { name: 'futmanager-carreira', version: 1, storage: createJSONStorage(() => localStorage) },
  ),
)

/** The career, for screens inside GameLayout, which only renders them when one exists. */
export function useGame(): GameState {
  const game = useGameStore((s) => s.game)
  if (!game) throw new Error('useGame() outside a running career')
  return game
}
