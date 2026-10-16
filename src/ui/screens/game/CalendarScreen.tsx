import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon, FastForwardIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { Fixture, GameState } from '../../../engine/model/types.ts'
import {
  dateOf,
  dateParts,
  daysInMonth,
  fifaDates,
  transferWindowAt,
  weekday,
  type GameDate,
} from '../../../engine/season/calendar.ts'
import { CUP_ID, tieWinner } from '../../../engine/season/cup.ts'
import { canPlayRound } from '../../../engine/season/season.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { simulate } from '../../../worker/simulate.ts'
import { announceChanges } from '../../announce.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { formatDayDate, formatDayMonth, MONTH_NAMES, WEEKDAY_NAMES } from '../../format.ts'
import { competitionsPath, CUP_SLUG } from '../../routes.ts'

const OUTCOME_STYLE = {
  V: 'text-green-600 dark:text-green-400',
  E: 'text-muted-foreground',
  D: 'text-red-600 dark:text-red-400',
}

/** What a day of the calendar holds for the user. */
type Day = {
  date: GameDate
  game?: Fixture
  /** A cup stage the user's club is not in. */
  cupStage?: string
  fifa?: boolean
}

const capitalize = (text: string) => text[0].toUpperCase() + text.slice(1)
const monthTitle = (year: number, month: number) => `${capitalize(MONTH_NAMES[month - 1])} ${year}`

/** Every day of the season with something on, by date. */
function seasonDays(game: GameState): Map<GameDate, Day> {
  const { season, userClubId } = game
  const days = new Map<GameDate, Day>()
  const at = (date: GameDate) => days.get(date) ?? days.set(date, { date }).get(date)!
  const own = (f: Fixture) => f.homeId === userClubId || f.awayId === userClubId
  for (const rounds of Object.values(season.fixtures)) {
    for (const fixture of rounds.flat().filter(own)) at(fixture.date).game = fixture
  }
  for (const stage of season.cup?.stages ?? []) {
    const tie = stage.ties.find(own)
    if (tie) at(tie.date).game = tie
    else at(stage.date).cupStage = stage.name
  }
  for (const date of fifaDates(season.year)) at(date).fifa = true
  return days
}

/** The season's last day of football, the furthest the calendar can be simulated to. */
function lastMatchDate(game: GameState): GameDate {
  const { season } = game
  const dates = [
    ...Object.values(season.fixtures).flatMap((rounds) => rounds.flat().map((f) => f.date)),
    ...(season.cup?.stages.map((s) => s.date) ?? []),
  ]
  return dates.reduce((last, date) => (date > last ? date : last), game.today)
}

/**
 * The season month by month: the user's games with the result once played,
 * the cup stages, the FIFA dates and the transfer windows. A grid on wide
 * screens, a list on phones; both open on the month the career is in.
 */
export function CalendarScreen() {
  const game = useGame()
  const { year } = game.season
  const today = dateParts(game.today)
  const current = today.year === year ? today.month : 12
  const [month, setMonth] = useState(current)
  const [showPast, setShowPast] = useState(false)
  const [target, setTarget] = useState<GameDate>()
  const days = seasonDays(game)
  const firstListed = showPast ? 1 : current
  const last = lastMatchDate(game)
  const playable = canPlayRound(game)
  /** Whether "simulate up to here" is on offer for a day. */
  const reachable = (date: GameDate) => playable && date > game.today && date <= last
  const pick = (date: GameDate) => {
    if (!reachable(date)) return
    setTarget(date)
    // The question shows above the calendar; on a phone the day may be far below it.
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <div className="flex flex-col gap-3">
      <Legend />
      {playable && (
        <p className="text-sm text-muted-foreground">Toque num dia para simular até ele.</p>
      )}
      {target && reachable(target) && (
        <SimulateUntil
          game={game}
          days={days}
          target={target}
          onDone={() => setTarget(undefined)}
        />
      )}
      <Card className="hidden gap-3 px-3 md:flex">
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Mês anterior"
            disabled={month === 1}
            onClick={() => setMonth(month - 1)}
          >
            <ChevronLeftIcon />
          </Button>
          <h2 className="font-semibold">{monthTitle(year, month)}</h2>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Próximo mês"
            disabled={month === 12}
            onClick={() => setMonth(month + 1)}
          >
            <ChevronRightIcon />
          </Button>
        </div>
        <MonthGrid
          game={game}
          year={year}
          month={month}
          days={days}
          target={target}
          reachable={reachable}
          onPick={pick}
        />
      </Card>

      <div className="flex flex-col gap-3 md:hidden">
        {!showPast && current > 1 && (
          <Button variant="outline" size="sm" onClick={() => setShowPast(true)}>
            Ver os meses anteriores
          </Button>
        )}
        {Array.from({ length: 13 - firstListed }, (_, i) => firstListed + i).map((m) => (
          <MonthList
            key={m}
            game={game}
            year={year}
            month={m}
            days={days}
            target={target}
            reachable={reachable}
            onPick={pick}
          />
        ))}
      </div>
    </div>
  )
}

/**
 * Asks to simulate up to the picked day, saying how many of the user's games
 * go by unwatched, and says where it stopped if a bid came in on the way.
 */
function SimulateUntil(props: {
  game: GameState
  days: Map<GameDate, Day>
  target: GameDate
  onDone: () => void
}) {
  const { game, days, target } = props
  const setGame = useGameStore((s) => s.setGame)
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const games = [...days.values()].filter(
    (d) => d.game && !d.game.result && d.date >= game.today && d.date < target,
  ).length
  const watch = days.get(target)?.game

  const run = async () => {
    setBusy(true)
    try {
      const next = await simulate(game, { until: target })
      setGame(next)
      announceChanges(game, next, navigate)
      if (next.today < target) {
        toast.info(`A simulação parou em ${formatDayDate(next.today)}.`, {
          description:
            next.career.status === 'empregado'
              ? 'Chegou uma proposta por um jogador seu. Responda antes de seguir.'
              : 'Você não está mais no comando do clube.',
        })
      }
      props.onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card className="flex-row flex-wrap items-center gap-3 border-primary/50 px-4 py-3">
      <div className="flex min-w-60 flex-1 flex-col gap-0.5">
        <span className="font-semibold">Simular até {formatDayDate(target)}</span>
        <span className="text-sm text-muted-foreground">
          {games === 0
            ? 'Nenhum jogo seu no caminho.'
            : `${games === 1 ? 'Seu jogo' : `Seus ${games} jogos`} até lá ${games === 1 ? 'vai ser simulado' : 'vão ser simulados'} sem você assistir.`}
          {watch && !watch.result && ' O jogo desse dia fica para você jogar.'} Para antes se chegar
          uma proposta por um jogador seu.
        </span>
      </div>
      <div className="flex gap-2">
        <Button variant="ghost" size="sm" disabled={busy} onClick={props.onDone}>
          Cancelar
        </Button>
        <Button size="sm" disabled={busy} onClick={run}>
          <FastForwardIcon />
          {busy ? 'Simulando...' : 'Simular'}
        </Button>
      </div>
    </Card>
  )
}

function Legend() {
  return (
    <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
      <span>C: em casa · F: fora</span>
      <span className="flex items-center gap-1">
        <span className="inline-block size-3 rounded-sm bg-emerald-500/20" />
        Janela de transferências
      </span>
      <span className="flex items-center gap-1">
        <span className="inline-block size-3 rounded-sm ring-2 ring-primary" />
        Hoje
      </span>
    </p>
  )
}

function MonthGrid(props: {
  game: GameState
  year: number
  month: number
  days: Map<GameDate, Day>
  target?: GameDate
  reachable: (date: GameDate) => boolean
  onPick: (date: GameDate) => void
}) {
  const { game, year, month, days, target, reachable, onPick } = props
  const first = dateOf(year, month, 1)
  const blanks = weekday(first)
  const count = daysInMonth(year, month)
  return (
    <div className="grid grid-cols-7 gap-1 text-xs">
      {WEEKDAY_NAMES.map((name) => (
        <div key={name} className="text-center font-semibold text-muted-foreground">
          {name}
        </div>
      ))}
      {Array.from({ length: blanks }, (_, i) => (
        <div key={`blank-${i}`} />
      ))}
      {Array.from({ length: count }, (_, i) => {
        const date = dateOf(year, month, i + 1)
        const day = days.get(date)
        const open = reachable(date)
        return (
          <div
            key={date}
            onClick={open ? () => onPick(date) : undefined}
            className={cn(
              'flex min-h-20 flex-col gap-0.5 rounded-md border p-1',
              transferWindowAt(date) && 'border-emerald-500/30 bg-emerald-500/15',
              open && 'cursor-pointer hover:border-primary/60',
              date === game.today && 'ring-2 ring-primary',
              date === target && 'border-primary bg-primary/15',
            )}
          >
            {open ? (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation()
                  onPick(date)
                }}
                aria-label={`Simular até ${formatDayDate(date)}`}
                className="cursor-pointer self-start text-muted-foreground tabular-nums hover:text-foreground"
              >
                {i + 1}
              </button>
            ) : (
              <span className="text-muted-foreground tabular-nums">{i + 1}</span>
            )}
            {day?.game && <GameEntry game={game} fixture={day.game} compact />}
            {day?.cupStage && <span className="text-muted-foreground">Copa: {day.cupStage}</span>}
            {day?.fifa && <span className="text-muted-foreground">Data FIFA</span>}
          </div>
        )
      })}
    </div>
  )
}

function MonthList(props: {
  game: GameState
  year: number
  month: number
  days: Map<GameDate, Day>
  target?: GameDate
  reachable: (date: GameDate) => boolean
  onPick: (date: GameDate) => void
}) {
  const { game, year, month, days, target, reachable, onPick } = props
  const entries = [...days.values()]
    .filter((d) => d.date.startsWith(dateOf(year, month, 1).slice(0, 8)))
    .sort((a, b) => a.date.localeCompare(b.date))
  const window =
    transferWindowAt(dateOf(year, month, 1)) ?? transferWindowAt(dateOf(year, month, 28))
  return (
    <Card className="gap-2 px-3">
      <h2 className="font-semibold">{monthTitle(year, month)}</h2>
      {window && (
        <p className="rounded bg-emerald-500/15 px-2 py-1 text-sm">
          Janela de transferências de {formatDayMonth(window.from)} a {formatDayMonth(window.to)}
        </p>
      )}
      {entries.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem jogos.</p>
      ) : (
        <ol className="flex flex-col gap-1 text-sm">
          {entries.map((day) => (
            <li
              key={day.date}
              className={cn(
                'grid grid-cols-[3.5rem_minmax(0,1fr)_2rem] items-center gap-2 rounded px-1',
                day.date === game.today && 'bg-highlight-soft',
                day.date === target && 'bg-primary/15',
              )}
            >
              <span className="text-muted-foreground tabular-nums">
                {WEEKDAY_NAMES[weekday(day.date)]} {dateParts(day.date).day}
              </span>
              {day.game ? (
                <GameEntry game={game} fixture={day.game} />
              ) : (
                <span className="text-muted-foreground">
                  {day.cupStage ? `Copa: ${day.cupStage}, sem você` : 'Data FIFA, sem jogos'}
                </span>
              )}
              {reachable(day.date) && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="size-8"
                  aria-label={`Simular até ${formatDayDate(day.date)}`}
                  title="Simular até aqui"
                  onClick={() => onPick(day.date)}
                >
                  <FastForwardIcon />
                </Button>
              )}
            </li>
          ))}
        </ol>
      )}
    </Card>
  )
}

/** One of the user's games: home or away, the opponent, the competition and, once played, the score. */
function GameEntry(props: { game: GameState; fixture: Fixture; compact?: boolean }) {
  const { game, fixture, compact } = props
  const { season, world, userClubId } = game
  const home = fixture.homeId === userClubId
  const opponent = world.clubs[home ? fixture.awayId : fixture.homeId]
  const { result } = fixture
  const [scored, conceded] = result
    ? home
      ? [result.homeGoals, result.awayGoals]
      : [result.awayGoals, result.homeGoals]
    : []
  const cup = fixture.leagueId === CUP_ID
  const outcome =
    scored === undefined
      ? undefined
      : scored > conceded! || (cup && scored === conceded && tieWinner(fixture) === userClubId)
        ? 'V'
        : scored === conceded && !cup
          ? 'E'
          : 'D'
  const stage = cup ? season.cup?.stages.find((st) => st.ties.includes(fixture)) : undefined
  const to = stage
    ? `/jogo/competicoes/${CUP_SLUG}/jogos?fase=${encodeURIComponent(stage.name)}`
    : `${competitionsPath(game, 'jogos')}?rodada=${fixture.round}`
  return (
    <Link
      to={to}
      title={stage ? `Copa, ${stage.name.toLowerCase()}` : `Liga, ${fixture.round}ª rodada`}
      className={cn(
        'flex min-w-0 rounded px-0.5 hover:bg-accent',
        compact ? 'flex-col items-start' : 'items-center gap-2',
      )}
    >
      <span className="flex min-w-0 items-center gap-1">
        <span
          className={cn(
            'shrink-0 rounded px-1 text-[0.65rem] font-semibold',
            cup ? 'bg-amber-500/25' : 'bg-muted',
          )}
        >
          {cup ? 'Copa' : 'Liga'}
        </span>
        <span className="text-muted-foreground" title={home ? 'Em casa' : 'Fora'}>
          {home ? 'C' : 'F'}
        </span>
        <ClubName club={opponent} short={compact} />
      </span>
      {outcome && (
        <span className={cn('tabular-nums', !compact && 'ml-auto', OUTCOME_STYLE[outcome])}>
          {outcome} {scored}-{conceded}
          {result?.penalties && ' pên.'}
        </span>
      )}
    </Link>
  )
}
