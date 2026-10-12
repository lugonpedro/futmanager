import { useState } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { Link } from 'react-router'
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
import { useGame } from '../../../store/game.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { formatDayMonth, MONTH_NAMES, WEEKDAY_NAMES } from '../../format.ts'
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
  const days = seasonDays(game)
  const firstListed = showPast ? 1 : current

  return (
    <div className="flex flex-col gap-3">
      <Legend />
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
        <MonthGrid game={game} year={year} month={month} days={days} />
      </Card>

      <div className="flex flex-col gap-3 md:hidden">
        {!showPast && current > 1 && (
          <Button variant="outline" size="sm" onClick={() => setShowPast(true)}>
            Ver os meses anteriores
          </Button>
        )}
        {Array.from({ length: 13 - firstListed }, (_, i) => firstListed + i).map((m) => (
          <MonthList key={m} game={game} year={year} month={m} days={days} />
        ))}
      </div>
    </div>
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
}) {
  const { game, year, month, days } = props
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
        return (
          <div
            key={date}
            className={cn(
              'flex min-h-20 flex-col gap-0.5 rounded-md border p-1',
              transferWindowAt(date) && 'border-emerald-500/30 bg-emerald-500/15',
              date === game.today && 'ring-2 ring-primary',
            )}
          >
            <span className="text-muted-foreground tabular-nums">{i + 1}</span>
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
}) {
  const { game, year, month, days } = props
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
                'grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-2 rounded px-1',
                day.date === game.today && 'bg-highlight-soft',
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
