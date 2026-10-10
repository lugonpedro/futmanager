import { useEffect } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

export type Theme = 'claro' | 'escuro' | 'sistema'

type ThemeStore = { theme: Theme; setTheme: (theme: Theme) => void }

export const useThemeStore = create<ThemeStore>()(
  persist((set) => ({ theme: 'sistema', setTheme: (theme) => set({ theme }) }), {
    name: 'futmanager-tema',
    storage: createJSONStorage(() => localStorage),
  }),
)

const darkQuery = () => window.matchMedia('(prefers-color-scheme: dark)')

/** Keeps the `dark` class on <html> in step with the chosen theme and, on "sistema", the OS. */
export function useApplyTheme() {
  const theme = useThemeStore((s) => s.theme)
  useEffect(() => {
    const apply = () =>
      document.documentElement.classList.toggle(
        'dark',
        theme === 'escuro' || (theme === 'sistema' && darkQuery().matches),
      )
    apply()
    if (theme !== 'sistema') return
    const query = darkQuery()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [theme])
}
