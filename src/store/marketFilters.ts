import { create } from 'zustand'
import { NO_FILTERS, type MarketFilters } from '../ui/marketFilter.ts'

type MarketFiltersStore = {
  filters: MarketFilters
  setFilters: (change: Partial<MarketFilters>) => void
  clearFilters: () => void
}

/** The market's filters, kept while the game is open so a player's card and back doesn't lose them. */
export const useMarketFilters = create<MarketFiltersStore>()((set) => ({
  filters: NO_FILTERS,
  setFilters: (change) => set((s) => ({ filters: { ...s.filters, ...change } })),
  clearFilters: () =>
    set((s) => ({
      filters: { ...NO_FILTERS, position: s.filters.position, sort: s.filters.sort },
    })),
}))
