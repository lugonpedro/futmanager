import {
  ArrowLeftRightIcon,
  CalendarDaysIcon,
  HouseIcon,
  LogOutIcon,
  MenuIcon,
  ShieldIcon,
  ShirtIcon,
  TrophyIcon,
  type LucideIcon,
} from 'lucide-react'
import { useState } from 'react'
import { Link, Navigate, NavLink, Outlet, useLocation } from 'react-router'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { GameState } from '../../../engine/model/types.ts'
import { isSeasonOver } from '../../../engine/season/season.ts'
import { useGameStore } from '../../../store/game.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { ThemeToggle } from '../../components/ThemeToggle.tsx'
import { divisionName, formatDayDate, formatMoney, formatShortDate } from '../../format.ts'

const PAGES: { to: string; label: string; icon: LucideIcon; end?: boolean }[] = [
  { to: '/jogo', label: 'Resumo', icon: HouseIcon, end: true },
  { to: '/jogo/time', label: 'Time', icon: ShirtIcon },
  { to: '/jogo/mercado', label: 'Mercado', icon: ArrowLeftRightIcon },
  { to: '/jogo/competicoes', label: 'Competições', icon: TrophyIcon },
  { to: '/jogo/calendario', label: 'Calendário', icon: CalendarDaysIcon },
  { to: '/jogo/clube', label: 'Clube', icon: ShieldIcon },
]

/**
 * Every screen of a running career sits in this frame: a sidebar on wide
 * screens; on phones, a top bar with a slide-out menu and the pages in a bar
 * along the bottom.
 */
export function GameLayout() {
  const game = useGameStore((s) => s.game)
  const loading = useGameStore((s) => s.loading)
  const [menuOpen, setMenuOpen] = useState(false)
  const { pathname } = useLocation()
  if (!game) {
    return loading ? (
      <p className="p-6 text-center text-muted-foreground">Carregando a carreira...</p>
    ) : (
      <Navigate to="/" replace />
    )
  }
  const current = PAGES.find((p) => (p.end ? pathname === p.to : pathname.startsWith(p.to)))

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-4 border-r bg-sidebar p-4 md:flex">
        <Sidebar game={game} />
      </aside>

      <header className="sticky top-0 z-40 flex items-center gap-2 border-b bg-background/95 px-2 py-2 backdrop-blur md:hidden">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" aria-label="Abrir menu">
              <MenuIcon />
            </Button>
          </SheetTrigger>
          <SheetContent side="left" className="w-72 gap-4 bg-sidebar p-4">
            <SheetTitle className="sr-only">Menu</SheetTitle>
            <Sidebar game={game} onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        <span className="min-w-0 flex-1 truncate font-semibold">{current?.label}</span>
        <span className="max-w-40 truncate text-sm text-muted-foreground">
          {game.world.clubs[game.userClubId].shortName} · {formatShortDate(game.today)}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-col gap-4 p-4 pb-24 md:p-6">
        <h1 className="hidden text-2xl font-bold md:block">{current?.label}</h1>
        <Outlet />
      </main>

      <nav
        aria-label="Páginas"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-6 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {PAGES.map((page) => (
          <NavLink
            key={page.to}
            to={page.to}
            end={page.end}
            className={({ isActive }) =>
              cn(
                'flex min-w-0 flex-col items-center gap-0.5 py-2 text-[0.6rem] leading-tight tracking-tight',
                isActive ? 'font-semibold text-primary' : 'text-muted-foreground',
              )
            }
          >
            <page.icon className="size-5" />
            <span className="max-w-full overflow-hidden">{page.label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Sidebar(props: { game: GameState; onNavigate?: () => void }) {
  const { game } = props
  const club = game.world.clubs[game.userClubId]
  const { season } = game
  return (
    <>
      <div className="flex flex-col gap-1 pr-6">
        <span className="font-bold">
          <ClubName club={club} />
        </span>
        <span className="text-xs text-muted-foreground">
          {divisionName(club.division)} {season.year} ·{' '}
          {isSeasonOver(season)
            ? 'temporada encerrada'
            : `rodada ${season.round} de ${season.totalRounds}`}
        </span>
        <span className="text-xs text-muted-foreground">Hoje: {formatDayDate(game.today)}</span>
        <span className="text-xs text-muted-foreground">Caixa {formatMoney(club.cash)}</span>
      </div>
      <Separator />
      <nav className="flex flex-col gap-1">
        {PAGES.map((page) => (
          <NavLink
            key={page.to}
            to={page.to}
            end={page.end}
            onClick={props.onNavigate}
            className={({ isActive }) =>
              cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
                isActive
                  ? 'bg-primary font-semibold text-primary-foreground'
                  : 'text-foreground/80 hover:bg-accent hover:text-accent-foreground',
              )
            }
          >
            <page.icon className="size-4" />
            {page.label}
          </NavLink>
        ))}
      </nav>
      <Separator />
      <div className="mt-auto flex flex-col gap-1">
        <ThemeToggle withLabel />
        <Button asChild variant="ghost" className="justify-start">
          <Link to="/" onClick={props.onNavigate}>
            <LogOutIcon />
            Menu principal
          </Link>
        </Button>
        <Link
          to="/aviso-legal"
          onClick={props.onNavigate}
          className="px-3 pt-1 text-xs text-muted-foreground underline-offset-2 hover:underline"
        >
          Aviso legal
        </Link>
      </div>
    </>
  )
}
