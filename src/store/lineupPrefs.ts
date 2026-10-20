import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type LineupPrefsStore = {
  /** Injured and banned starters are swapped for the best fit without asking. */
  autoReplace: boolean
  setAutoReplace: (autoReplace: boolean) => void
}

export const useLineupPrefs = create<LineupPrefsStore>()(
  persist(
    (set) => ({ autoReplace: false, setAutoReplace: (autoReplace) => set({ autoReplace }) }),
    { name: 'futmanager-desfalques', storage: createJSONStorage(() => localStorage) },
  ),
)
