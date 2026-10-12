import { create } from 'zustand'
import { emptyPack, type DataPack } from '../engine/pack/pack.ts'

/** Where the pack being put together lives; it never leaves the player's browser. */
const PACK_KEY = 'futmanager-pacote'

function load(): DataPack {
  try {
    const saved = localStorage.getItem(PACK_KEY)
    const pack = saved ? (JSON.parse(saved) as DataPack) : undefined
    return pack && Array.isArray(pack.clubs) ? pack : emptyPack()
  } catch {
    return emptyPack()
  }
}

function persist(pack: DataPack) {
  try {
    localStorage.setItem(PACK_KEY, JSON.stringify(pack))
  } catch {
    // Private windows may refuse storage; the pack still works until the page closes.
  }
}

type PackStore = {
  /** The pack the editor works on and a new career can start with. */
  pack: DataPack
  setPack: (pack: DataPack) => void
}

export const usePackStore = create<PackStore>()((set) => ({
  pack: load(),
  setPack: (pack) => {
    set({ pack })
    persist(pack)
  },
}))
