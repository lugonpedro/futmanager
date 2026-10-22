import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeftIcon, MenuIcon } from 'lucide-react'
import { Link, NavLink } from 'react-router'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { DraftTeam } from '../../cloud/draft.ts'
import type { Room } from '../../cloud/rooms.ts'
import { ROOM_PAGES, type RoomPageSlug } from '../roomPages.ts'
import { TeamCrest } from './RoomParts.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'

/** The pages along the bottom on a phone; the rest are in the side menu. */
const BOTTOM = ROOM_PAGES.filter((page) => page.slug !== 'sala')

const pageLink = (room: Room, slug: RoomPageSlug) => `/sala/${room.id}${slug ? `/${slug}` : ''}`

/**
 * The room's league in the career's frame: a side menu on wide screens; on
 * phones, a top bar with a slide-out menu and the pages along the bottom.
 */
export function RoomLayout(props: {
  room: Room
  page: RoomPageSlug
  mine?: DraftTeam
  /** Where the room stands, under its name: the round under way, or the end. */
  status: string
  /** Pages with something waiting for the player, marked with a dot. */
  marked: ReadonlySet<RoomPageSlug>
  children: ReactNode
}) {
  const { room, page } = props
  const [menuOpen, setMenuOpen] = useState(false)
  const current = ROOM_PAGES.find((p) => p.slug === page)!

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [page])

  return (
    <div className="min-h-screen md:grid md:grid-cols-[15rem_minmax(0,1fr)]">
      <aside className="sticky top-0 hidden h-screen flex-col gap-4 border-r bg-sidebar p-4 md:flex">
        <Sidebar {...props} />
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
            <Sidebar {...props} onNavigate={() => setMenuOpen(false)} />
          </SheetContent>
        </Sheet>
        <span className="min-w-0 flex-1 truncate font-semibold">{current.label}</span>
        <span className="max-w-[45%] shrink-0 truncate text-sm text-muted-foreground">
          {room.name}
        </span>
      </header>

      <main className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4 pb-24 md:p-6">
        <h1 className="hidden text-2xl font-bold md:block">{current.label}</h1>
        {props.children}
      </main>

      <nav
        aria-label="Páginas da sala"
        className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {BOTTOM.map((p) => (
          <NavLink
            key={p.slug}
            to={pageLink(room, p.slug)}
            end
            className={({ isActive }) =>
              cn(
                'relative flex min-w-0 flex-col items-center gap-0.5 py-2 text-[0.6rem] leading-tight tracking-tight',
                isActive ? 'font-semibold text-primary' : 'text-muted-foreground',
              )
            }
          >
            <p.icon className="size-5" />
            <span className="max-w-full overflow-hidden">{p.label}</span>
            {props.marked.has(p.slug) && (
              <Dot className="absolute top-1.5 right-[calc(50%-0.9rem)]" />
            )}
          </NavLink>
        ))}
      </nav>
    </div>
  )
}

function Dot(props: { className?: string }) {
  return (
    <span
      className={cn('size-2 rounded-full bg-highlight', props.className)}
      aria-label="Tem novidade"
    />
  )
}

function Sidebar(props: {
  room: Room
  mine?: DraftTeam
  status: string
  marked: ReadonlySet<RoomPageSlug>
  onNavigate?: () => void
}) {
  const { room, mine } = props
  return (
    <>
      <div className="flex items-center gap-3 pr-6">
        {mine && <TeamCrest team={mine} id={`menu-${mine.slot}`} className="size-10 shrink-0" />}
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="truncate font-bold">{mine?.name ?? room.name}</span>
          {mine && <span className="truncate text-xs text-muted-foreground">{room.name}</span>}
          <span className="text-xs text-muted-foreground first-letter:uppercase">
            {props.status}
          </span>
        </div>
      </div>
      <Separator />
      <nav className="flex flex-col gap-1">
        {ROOM_PAGES.map((p) => (
          <NavLink
            key={p.slug}
            to={pageLink(room, p.slug)}
            end
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
            <p.icon className="size-4" />
            {p.label}
            {props.marked.has(p.slug) && <Dot className="ml-auto" />}
          </NavLink>
        ))}
      </nav>
      <Separator />
      <div className="mt-auto flex flex-col gap-1">
        <ThemeToggle withLabel />
        <Button asChild variant="ghost" className="justify-start">
          <Link to="/salas" onClick={props.onNavigate}>
            <ArrowLeftIcon />
            Minhas salas
          </Link>
        </Button>
      </div>
    </>
  )
}
