import { create } from 'zustand'
import { newSlotId, readSave, writeSave } from '../db/saves.ts'
import type { GameState } from '../engine/model/types.ts'
import { upgradeGame } from '../engine/save.ts'

type GameStore = {
  game?: GameState
  /** Save slot the running career is written to after every change. */
  slotId?: string
  /** Whether the last career is still being read back from the database at start-up. */
  loading: boolean
  /** Replaces the running career and saves it to its slot. */
  setGame: (game: GameState) => void
  /** Starts a career in a new slot. */
  startGame: (game: GameState) => void
  /** Loads a saved career; false if the slot is gone. */
  openSave: (slotId: string) => Promise<boolean>
  closeGame: () => void
}

/** Remembers which slot to reopen when the page is loaded again. */
const LAST_SLOT_KEY = 'futmanager-ultimo-save'
/** Where careers lived before saves moved to IndexedDB. */
const LEGACY_KEY = 'futmanager-carreira'

const storage = {
  get: (key: string) => {
    try {
      return localStorage.getItem(key)
    } catch {
      return null
    }
  },
  set: (key: string, value: string | undefined) => {
    try {
      if (value === undefined) localStorage.removeItem(key)
      else localStorage.setItem(key, value)
    } catch {
      // Private windows may refuse storage; the career still runs, it just won't reopen.
    }
  },
}

// Writes go one after another, so an older state never lands after a newer one.
let writes: Promise<unknown> = Promise.resolve()
function autosave(game: GameState, slotId: string) {
  writes = writes.then(() => writeSave(game, slotId)).catch((error) => console.error(error))
}

export const useGameStore = create<GameStore>()((set, get) => ({
  game: undefined,
  slotId: undefined,
  loading: true,
  setGame: (game) => {
    const slotId = get().slotId ?? newSlotId()
    set({ game, slotId })
    storage.set(LAST_SLOT_KEY, slotId)
    autosave(game, slotId)
  },
  startGame: (game) => {
    set({ slotId: undefined })
    get().setGame(game)
  },
  openSave: async (slotId) => {
    const game = await readSave(slotId)
    if (!game) return false
    set({ game, slotId })
    storage.set(LAST_SLOT_KEY, slotId)
    return true
  },
  closeGame: () => {
    set({ game: undefined, slotId: undefined })
    storage.set(LAST_SLOT_KEY, undefined)
  },
}))

/**
 * Start-up: moves a career kept in localStorage by older versions into its own
 * slot, then reopens the career played last.
 */
export async function restoreLastGame() {
  const store = useGameStore.getState()
  try {
    const legacy = storage.get(LEGACY_KEY)
    if (legacy) {
      const saved = JSON.parse(legacy) as { state?: { game?: Parameters<typeof upgradeGame>[0] } }
      if (saved.state?.game) {
        const id = await writeSave(upgradeGame(saved.state.game))
        storage.set(LAST_SLOT_KEY, id)
      }
      storage.set(LEGACY_KEY, undefined)
    }
    const last = storage.get(LAST_SLOT_KEY)
    if (last && !(await store.openSave(last))) storage.set(LAST_SLOT_KEY, undefined)
  } catch (error) {
    console.error(error)
  } finally {
    useGameStore.setState({ loading: false })
  }
}

/** The career, for screens inside GameLayout, which only renders them when one exists. */
export function useGame(): GameState {
  const game = useGameStore((s) => s.game)
  if (!game) throw new Error('useGame() outside a running career')
  return game
}
