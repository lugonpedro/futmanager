import { MoonIcon, SunIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useThemeStore, type Theme } from '../../store/theme.ts'

const NEXT: Record<Theme, Theme> = { claro: 'escuro', escuro: 'claro' }
const ICON = { claro: SunIcon, escuro: MoonIcon }
const LABEL: Record<Theme, string> = { claro: 'Tema claro', escuro: 'Tema escuro' }

/** Switches between the light and the dark theme. */
export function ThemeToggle(props: { withLabel?: boolean }) {
  const { theme, setTheme } = useThemeStore()
  const Icon = ICON[theme]
  return (
    <Button
      variant="ghost"
      size={props.withLabel ? 'default' : 'icon'}
      onClick={() => setTheme(NEXT[theme])}
      title={`${LABEL[theme]} (toque para trocar)`}
      className={props.withLabel ? 'justify-start' : undefined}
    >
      <Icon />
      {props.withLabel ? LABEL[theme] : <span className="sr-only">{LABEL[theme]}</span>}
    </Button>
  )
}
