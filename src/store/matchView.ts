import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

/** "Campo" draws the match on the 2D pitch; "Só texto" is the classic commentary alone. */
export type MatchView = 'Campo' | 'Só texto'

type MatchViewStore = { view: MatchView; setView: (view: MatchView) => void }

export const useMatchViewStore = create<MatchViewStore>()(
  persist((set) => ({ view: 'Campo', setView: (view) => set({ view }) }), {
    name: 'futmanager-partida',
    storage: createJSONStorage(() => localStorage),
  }),
)
