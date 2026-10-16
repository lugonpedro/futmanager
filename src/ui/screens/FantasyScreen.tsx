import {
  ArrowLeftIcon,
  MinusIcon,
  PlayIcon,
  PlusIcon,
  SaveIcon,
  SearchIcon,
  StarIcon,
} from 'lucide-react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { cloudEnabled } from '../../cloud/client.ts'
import { loadFantasy, saveFantasyTeam, type FantasyView } from '../../cloud/fantasy.ts'
import type { OfficialClub, PoolPlayer } from '../../engine/fantasy/official.ts'
import { BUDGET, checkTeam, teamCost } from '../../engine/fantasy/team.ts'
import { FORMATIONS } from '../../engine/match/lineup.ts'
import { POSITIONS, type Position } from '../../engine/model/types.ts'
import { useAccountStore } from '../../store/account.ts'
import { Choices } from '../components/Choices.tsx'
import { FantasyLeagues } from '../components/FantasyLeagues.tsx'
import { FantasyNotices } from '../components/FantasyNotices.tsx'
import { ClubMark, Note } from '../components/FantasyParts.tsx'
import { FormationSelect } from '../components/FormationSelect.tsx'
import { Pager } from '../components/Pager.tsx'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import {
  addPlayer,
  cannotAdd,
  emptyDraft,
  openSlots,
  removePlayer,
  withFormation,
  type Draft,
} from '../fantasyDraft.ts'
import { POSITION_NAMES, tenths } from '../format.ts'
import { usePage } from '../usePage.ts'

const closing = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

/** How many players the market list shows at once. */
const LIST_SIZE = 30

type Filter = 'todos' | Position

/** The online fantasy game: the official season's market and the player's team for the next round. */
export function FantasyScreen() {
  const { ready, user } = useAccountStore()
  const [view, setView] = useState<FantasyView | null>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!cloudEnabled || !ready) return
    let live = true
    loadFantasy(user?.id)
      .then((loaded) => live && setView(loaded ?? null))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [ready, user?.id])

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Voltar ao início">
            <Link to="/">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <h1 className="text-2xl font-bold">Fantasia online</h1>
        </div>
        <ThemeToggle />
      </header>

      {!cloudEnabled ? (
        <Note>O jogo online não está disponível nesta versão.</Note>
      ) : failed ? (
        <Note>Não deu para carregar a temporada agora. Tente de novo mais tarde.</Note>
      ) : view === undefined ? (
        <Note>Carregando…</Note>
      ) : view === null ? (
        <Note>
          A temporada oficial ainda não começou. Quando ela abrir, o mercado da primeira rodada
          aparece aqui.
        </Note>
      ) : (
        <Season key={view.season.id} view={view} signedIn={Boolean(user)} onSaved={setView} />
      )}
    </main>
  )
}

/** The time, refreshed every half minute, so the market closes on screen when it does. */
function useNow() {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(timer)
  }, [])
  return now
}

function Season(props: {
  view: FantasyView
  signedIn: boolean
  onSaved: (view: FantasyView) => void
}) {
  const { view } = props
  const { season, pool } = view
  const next = season.played + 1
  const now = useNow()
  const open = view.closesAt !== undefined && now < view.closesAt.getTime()

  const [draft, setDraft] = useState<Draft>(() =>
    view.team ? withFormation(view.team, view.team.formation, pool) : emptyDraft(),
  )
  const [saving, setSaving] = useState(false)
  const verdict = checkTeam(draft, pool)
  const cost = teamCost(draft, pool)

  const save = async () => {
    setSaving(true)
    try {
      await saveFantasyTeam(draft)
      toast.success(`Time salvo para a rodada ${next}.`)
      props.onSaved({ ...view, team: draft, teamIsForNext: true })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Brasileirão oficial {season.year}</CardTitle>
          <CardDescription>
            {view.closesAt === undefined
              ? 'Temporada encerrada. A próxima começa no dia seguinte.'
              : `Rodada ${next} de ${season.rounds}. ${
                  open
                    ? `Mercado aberto até ${closing.format(view.closesAt)}.`
                    : 'Mercado fechado. A rodada sai às 21h.'
                }`}
          </CardDescription>
        </CardHeader>
        {season.played > 0 && (
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              {view.lastScore !== undefined
                ? `Seu time fez ${tenths.format(view.lastScore)} pontos na rodada ${season.played}.`
                : `A rodada ${season.played} já foi jogada.`}
            </span>
            <Button asChild size="sm" variant="outline">
              <Link to={`/fantasia/rodada/${season.played}`}>
                <PlayIcon />
                Ver os jogos da rodada
              </Link>
            </Button>
          </CardContent>
        )}
      </Card>

      {!props.signedIn && (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>Entre na sua conta para escalar o seu time e jogar em ligas com os amigos.</span>
            <Button asChild size="sm">
              <Link to="/conta">Entrar</Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {props.signedIn && (
        <FantasyLeagues seasonId={season.id} running={season.status === 'em_andamento'} />
      )}

      {props.signedIn && <FantasyNotices />}

      {props.signedIn && (
        <Card>
          <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle>Seu time</CardTitle>
              <CardDescription>
                {tenths.format(cost)} de {BUDGET} moedas
                {cost <= BUDGET && ` · sobram ${tenths.format(BUDGET - cost)}`}
                {view.team && !view.teamIsForNext && ' · igual ao da última rodada'}
              </CardDescription>
            </div>
            <FormationSelect
              value={draft.formation}
              onChange={(formation) => setDraft(withFormation(draft, formation, pool))}
              disabled={!open}
            />
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <Lineup
              draft={draft}
              pool={pool}
              clubs={season.clubs}
              points={view.lastPoints}
              editable={open}
              onChange={setDraft}
            />
            <div className="flex flex-wrap items-center justify-end gap-3">
              {!verdict.ok && (
                <span className="text-sm text-muted-foreground">{verdict.reason}</span>
              )}
              <Button onClick={save} disabled={!open || !verdict.ok || saving}>
                <SaveIcon />
                Salvar time
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Market
        draft={draft}
        pool={pool}
        clubs={season.clubs}
        points={view.lastPoints}
        editable={props.signedIn && open}
        onChange={setDraft}
      />
    </>
  )
}

function PlayerLine(props: {
  id: string
  player: PoolPlayer
  clubs: Record<string, OfficialClub>
  points: Record<string, number>
  children?: ReactNode
}) {
  const { player } = props
  const last = props.points[props.id]
  return (
    <li className="flex items-center gap-2 rounded-md border p-2">
      <ClubMark clubId={player.clubId} clubs={props.clubs} />
      <div className="flex min-w-0 flex-1 flex-col">
        <span className="truncate font-medium">{player.name}</span>
        <span className="text-xs text-muted-foreground">
          {props.clubs[player.clubId]?.shortName} · {POSITION_NAMES[player.position]}
          {last !== undefined && ` · ${tenths.format(last)} pts na última rodada`}
        </span>
      </div>
      <span className="text-sm tabular-nums">{tenths.format(player.price)}</span>
      {props.children}
    </li>
  )
}

function Lineup(props: {
  draft: Draft
  pool: Record<string, PoolPlayer>
  clubs: Record<string, OfficialClub>
  points: Record<string, number>
  editable: boolean
  onChange: (draft: Draft) => void
}) {
  const { draft, pool } = props
  const open = openSlots(draft, pool)
  return (
    <div className="flex flex-col gap-3">
      {POSITIONS.filter((position) => FORMATIONS[draft.formation][position] > 0).map((position) => (
        <section key={position} className="flex flex-col gap-1">
          <h3 className="text-sm font-semibold text-muted-foreground">
            {POSITION_NAMES[position]} ({FORMATIONS[draft.formation][position] - open[position]} de{' '}
            {FORMATIONS[draft.formation][position]})
          </h3>
          <ul className="flex flex-col gap-1">
            {draft.playerIds
              .filter((id) => pool[id].position === position)
              .map((id) => (
                <PlayerLine
                  key={id}
                  id={id}
                  player={pool[id]}
                  clubs={props.clubs}
                  points={props.points}
                >
                  <Button
                    size="icon"
                    variant={draft.captainId === id ? 'default' : 'ghost'}
                    aria-label={`Capitão: ${pool[id].name}`}
                    aria-pressed={draft.captainId === id}
                    title="Capitão (pontua 1,5 vez)"
                    disabled={!props.editable}
                    onClick={() => props.onChange({ ...draft, captainId: id })}
                  >
                    <StarIcon />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label={`Tirar ${pool[id].name} do time`}
                    disabled={!props.editable}
                    onClick={() => props.onChange(removePlayer(draft, id))}
                  >
                    <MinusIcon />
                  </Button>
                </PlayerLine>
              ))}
            {Array.from({ length: open[position] }, (_, i) => (
              <li
                key={`vaga-${i}`}
                className="rounded-md border border-dashed p-2 text-sm text-muted-foreground"
              >
                Vaga de {POSITION_NAMES[position].toLowerCase()}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  )
}

function Market(props: {
  draft: Draft
  pool: Record<string, PoolPlayer>
  clubs: Record<string, OfficialClub>
  points: Record<string, number>
  editable: boolean
  onChange: (draft: Draft) => void
}) {
  const { draft, pool } = props
  const [filter, setFilter] = useState<Filter>('todos')
  const [search, setSearch] = useState('')

  const listed = useMemo(() => {
    const words = search.trim().toLocaleLowerCase('pt-BR')
    return Object.entries(pool)
      .filter(([, p]) => filter === 'todos' || p.position === filter)
      .filter(
        ([, p]) =>
          !words ||
          p.name.toLocaleLowerCase('pt-BR').includes(words) ||
          props.clubs[p.clubId]?.name.toLocaleLowerCase('pt-BR').includes(words),
      )
      .sort((a, b) => b[1].price - a[1].price || a[1].name.localeCompare(b[1].name))
  }, [pool, filter, search, props.clubs])
  const paged = usePage(listed, LIST_SIZE, `${filter}|${search.trim()}`)

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <CardTitle>Mercado</CardTitle>
        <div className="flex flex-wrap items-center gap-2">
          <Choices<Filter>
            options={['todos', ...POSITIONS]}
            value={filter}
            onChange={setFilter}
            label={(f) => (f === 'todos' ? 'Todos' : f)}
            title={(f) => (f === 'todos' ? 'Todas as posições' : POSITION_NAMES[f])}
            ariaLabel="Posição"
          />
          <div className="relative min-w-40 flex-1">
            <SearchIcon className="absolute top-1/2 left-2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Jogador ou clube"
              aria-label="Buscar jogador ou clube"
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <ul className="flex flex-col gap-1">
          {paged.items.map(([id, player]) => {
            const picked = draft.playerIds.includes(id)
            const blocked = picked ? undefined : cannotAdd(draft, id, pool)
            return (
              <PlayerLine
                key={id}
                id={id}
                player={player}
                clubs={props.clubs}
                points={props.points}
              >
                {picked && <Badge variant="secondary">No time</Badge>}
                {props.editable && (
                  <Button
                    size="icon"
                    variant={picked ? 'ghost' : 'outline'}
                    aria-label={picked ? `Tirar ${player.name} do time` : `Escalar ${player.name}`}
                    title={blocked}
                    disabled={!picked && blocked !== undefined}
                    className={cn(!picked && blocked && 'opacity-50')}
                    onClick={() =>
                      props.onChange(picked ? removePlayer(draft, id) : addPlayer(draft, id))
                    }
                  >
                    {picked ? <MinusIcon /> : <PlusIcon />}
                  </Button>
                )}
              </PlayerLine>
            )
          })}
        </ul>
        <Pager paged={paged} />
        {listed.length === 0 && (
          <p className="text-center text-sm text-muted-foreground">Ninguém encontrado.</p>
        )}
      </CardContent>
    </Card>
  )
}
