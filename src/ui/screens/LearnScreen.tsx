import { ArrowLeftIcon } from 'lucide-react'
import { useEffect } from 'react'
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import {
  CAREER_GUIDE,
  CAREER_SECTIONS,
  learnPath,
  type LearnAnchor,
  type LearnContent,
} from '../learn.ts'
import { shotPath, type LearnShot } from '../learnShots.ts'

const TABS = {
  carreira: { label: 'Carreira', guide: CAREER_GUIDE, sections: CAREER_SECTIONS },
} as const

type Tab = keyof typeof TABS

const isTab = (tab: string): tab is Tab => tab in TABS

/** How the career works, one tab per mode, with an index of sections. */
export function LearnScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { tab = 'carreira' } = useParams()

  useEffect(() => {
    const id = decodeURIComponent(location.hash.slice(1))
    if (id) document.getElementById(id)?.scrollIntoView({ block: 'start' })
    else window.scrollTo({ top: 0 })
  }, [tab, location.hash])

  if (!isTab(tab)) return <Navigate to="/aprenda" replace />

  // Opened from inside a career, going back returns there; opened directly, to the menu.
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

      <Tabs value={tab} onValueChange={(next) => navigate(learnPath({ tab: next as Tab }))}>
        <TabsList>
          {(Object.keys(TABS) as Tab[]).map((key) => (
            <TabsTrigger key={key} value={key}>
              {TABS[key].label}
            </TabsTrigger>
          ))}
        </TabsList>
        <TabsContent value="carreira" className="flex flex-col gap-4">
          <Guide tab="carreira" />
        </TabsContent>
      </Tabs>
    </main>
  )
}

/** The tab's index, then one card per section, each with an anchor other screens link to. */
function Guide(props: { tab: Tab }) {
  const { guide, sections } = TABS[props.tab]
  const content = guide as Record<string, LearnContent>
  return (
    <>
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
  const { title, items, table, shot } = props.content
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
        {table && (
          <Table>
            <TableHeader>
              <TableRow>
                {table.head.map((cell) => (
                  <TableHead key={cell}>{cell}</TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {table.rows.map((row) => (
                <TableRow key={row[0]}>
                  {row.map((cell, i) => (
                    <TableCell key={i} className="whitespace-normal">
                      {cell}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
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
