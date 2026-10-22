import { ArrowLeftIcon, ImageIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import {
  LEARN_TABS,
  learnPath,
  MOVED_SECTIONS,
  type LearnAnchor,
  type LearnContent,
  type LearnTab,
} from '../learn.ts'
import { missingShot, shotPath, type LearnShot } from '../learnShots.ts'

const isTab = (tab: string): tab is LearnTab => tab in LEARN_TABS

/** How the game works: what holds in both modes, then a tab for each mode. */
export function LearnScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { tab = 'em-campo' } = useParams()
  const hash = decodeURIComponent(location.hash.slice(1))

  useEffect(() => {
    if (hash) document.getElementById(hash)?.scrollIntoView({ block: 'start' })
    else window.scrollTo({ top: 0 })
  }, [tab, hash])

  if (!isTab(tab)) return <Navigate to="/aprenda" replace />
  // A link to a section of the old career tab that moved.
  const moved = tab === 'carreira' ? MOVED_SECTIONS[hash] : undefined
  if (moved) return <Navigate to={learnPath(moved)} replace />

  // Opened from inside a career or a room, going back returns there; opened directly, to the menu.
  const back = () => (location.key === 'default' ? navigate('/') : navigate(-1))

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" aria-label="Voltar" onClick={back}>
            <ArrowLeftIcon />
          </Button>
          <h1 className="text-2xl font-bold">Aprenda</h1>
        </div>
        <ThemeToggle />
      </header>

      <Tabs value={tab} onValueChange={(next) => navigate(learnPath({ tab: next as LearnTab }))}>
        <TabsList>
          {(Object.keys(LEARN_TABS) as LearnTab[]).map((key) => (
            <TabsTrigger key={key} value={key}>
              {LEARN_TABS[key].label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value={tab} className="flex flex-col gap-4">
          <Guide tab={tab} />
        </TabsContent>
      </Tabs>
    </main>
  )
}

/** The tab's opening line and index, then one card per section, each with an anchor other screens link to. */
function Guide(props: { tab: LearnTab }) {
  const { intro, sections, content } = LEARN_TABS[props.tab] as {
    intro: string
    sections: readonly string[]
    content: Record<string, LearnContent>
  }
  return (
    <>
      <p className="text-sm text-muted-foreground">{intro}</p>
      <nav aria-label="Nesta página" className="rounded-md border p-3">
        <ol className="grid gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
          {sections.map((id) => (
            <li key={id}>
              <Link
                to={learnPath({ tab: props.tab, section: id } as LearnAnchor)}
                className="underline-offset-2 hover:underline"
              >
                {content[id].title}
              </Link>
            </li>
          ))}
        </ol>
      </nav>
      {sections.map((id) => (
        <Section key={id} id={id} content={content[id]} />
      ))}
    </>
  )
}

function Section(props: { id: string; content: LearnContent }) {
  const { title, items, shot } = props.content
  return (
    <Card id={props.id} className="scroll-mt-4 gap-3">
      <CardHeader>
        <CardTitle id={`${props.id}-title`} role="heading" aria-level={2}>
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {shot && <Shot shot={shot} title={title} />}
        <ul className="flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </CardContent>
    </Card>
  )
}

/** Phones get the phone shot; anything wider, the computer one. */
const WIDE = '(min-width: 640px)'

function ShotPicture(props: { shot: LearnShot; alt: string; className?: string; lazy?: boolean }) {
  return (
    <picture>
      <source media={WIDE} srcSet={shotPath(props.shot, 'computador')} />
      <img
        src={shotPath(props.shot, 'celular')}
        alt={props.alt}
        loading={props.lazy ? 'lazy' : undefined}
        decoding="async"
        className={props.className}
      />
    </picture>
  )
}

/** A screenshot of the screen the section is about; tapping it opens it full size. */
function Shot(props: { shot: LearnShot; title: string }) {
  const missing = missingShot(props.shot)
  if (missing) return <ShotPlaceholder caption={missing} />
  const alt = `Tela do jogo: ${props.title}`
  return (
    <Dialog>
      <DialogTrigger asChild>
        <button
          type="button"
          aria-label={`Ampliar o print: ${props.title}`}
          className="cursor-zoom-in overflow-hidden rounded-md border"
        >
          <ShotPicture
            shot={props.shot}
            alt={alt}
            lazy
            className="max-h-80 w-full object-cover object-top"
          />
        </button>
      </DialogTrigger>
      <DialogContent className="max-h-[94vh] max-w-[96vw] overflow-y-auto p-2 pt-10 sm:max-w-5xl">
        <DialogTitle className="sr-only">{props.title}</DialogTitle>
        <ShotPicture shot={props.shot} alt={alt} className="w-full rounded-md" />
      </DialogContent>
    </Dialog>
  )
}

/** Where a screenshot still to be taken goes, saying what it will show. */
function ShotPlaceholder(props: { caption: string }) {
  return (
    <div
      role="img"
      aria-label={`Print em breve: ${props.caption}`}
      className="flex h-40 flex-col items-center justify-center gap-2 rounded-md border border-dashed bg-muted/40 p-4 text-center text-xs text-muted-foreground"
    >
      <ImageIcon className="size-6" />
      <span>Print em breve: {props.caption}</span>
    </div>
  )
}
