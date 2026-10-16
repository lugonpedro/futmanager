import { useEffect } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type Theme = 'claro' | 'escuro'

type ThemeStore = { theme: Theme; setTheme: (theme: Theme) => void }

export const useThemeStore = create<ThemeStore>()(
  persist((set) => ({ theme: 'escuro', setTheme: (theme) => set({ theme }) }), {
    name: 'futmanager-tema',
    storage: createJSONStorage(() => localStorage),
    // Version 0 also had "sistema", following the OS; it is gone and dark took its place.
    version: 1,
    migrate: (saved) => ({
      theme: (saved as { theme?: string } | undefined)?.theme === 'claro' ? 'claro' : 'escuro',
    }),
  }),
)

/** Keeps the `dark` class on <html> in step with the chosen theme. */
export function useApplyTheme() {
  const theme = useThemeStore((s) => s.theme)
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'escuro')
  }, [theme])
}
