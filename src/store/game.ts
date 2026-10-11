import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { GameState } from '../engine/model/types.ts'
import { upgradeGame } from '../engine/save.ts'
import { SAVE_VERSION } from '../engine/season/season.ts'

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
    {
      name: 'futmanager-carreira',
      version: SAVE_VERSION,
      storage: createJSONStorage(() => localStorage),
      migrate: (persisted) => {
        const state = persisted as { game?: Parameters<typeof upgradeGame>[0] }
        return { ...state, game: state.game && upgradeGame(state.game) } as GameStore
      },
    },
  ),
)

/** The career, for screens inside GameLayout, which only renders them when one exists. */
export function useGame(): GameState {
  const game = useGameStore((s) => s.game)
  if (!game) throw new Error('useGame() outside a running career')
  return game
}
