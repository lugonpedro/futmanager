import { MinusIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { attendance, fairTicketPrice } from '../../../engine/finance/economy.ts'
import { userSponsorTotal } from '../../../engine/finance/sponsors.ts'
import {
  averageGate,
  ledgerTotals,
  monthlyTotals,
  setTicketPrice,
  standingsShare,
  wageBill,
} from '../../../engine/finance/finance.ts'
import type { LedgerCategory } from '../../../engine/model/types.ts'
import type { MonthTotals } from '../../../engine/finance/finance.ts'
import { dateParts, MONTH_NAMES } from '../../../engine/season/calendar.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { formatDayMonth, formatMoney, formatReais, LEDGER_NAMES } from '../../format.ts'

const INCOME: LedgerCategory[] = ['bilheteria', 'patrocinio', 'premiacao', 'vendas']
const COSTS: LedgerCategory[] = ['salarios', 'compras']
const RECENT = 20

const signed = (value: number) => cn('tabular-nums', value < 0 ? 'text-destructive' : '')

/** Money in and out: the balance, this season by category, the latest entries and past seasons. */
export function FinancePanel() {
  const game = useGame()
  const { world, userClubId, ledger, history } = game
  const club = world.clubs[userClubId]
  const totals = ledgerTotals(ledger)
  const balance = Object.values(totals).reduce((a, b) => a + b, 0)
  const months = monthlyTotals(ledger)
  const today = dateParts(game.today)
  const thisMonth = months.find((m) => m.year === today.year && m.month === today.month)
  const past = history
    .filter((h) => h.userFinances)
    .slice(-3)
    .reverse()

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Caixa" value={club.cash} />
        <Stat label="Saldo da temporada" value={balance} />
        <Stat label="Salários por mês" value={-wageBill(world, club)} />
        <Stat label="Patrocínio por mês" value={userSponsorTotal(game)} />
      </div>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Mês a mês</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm">
            Em {MONTH_NAMES[today.month - 1]}: receitas de{' '}
            <span className="text-green-600 tabular-nums dark:text-green-400">
              {formatMoney(thisMonth?.income ?? 0)}
            </span>{' '}
            e despesas de{' '}
            <span className="text-destructive tabular-nums">
              {formatMoney(thisMonth?.costs ?? 0)}
            </span>
            .
          </p>
          {months.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lançamento nesta temporada.</p>
          ) : (
            <MonthChart months={months} current={thisMonth} />
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        <Card className="gap-3">
          <CardHeader>
            <CardTitle>Temporada {game.season.year}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {[...INCOME, ...COSTS].map((category) => (
                  <TableRow key={category}>
                    <TableCell>{LEDGER_NAMES[category]}</TableCell>
                    <TableCell className={cn('text-right', signed(totals[category] ?? 0))}>
                      {formatMoney(totals[category] ?? 0)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow className="font-semibold">
                  <TableCell>Saldo</TableCell>
                  <TableCell className={cn('text-right', signed(balance))}>
                    {formatMoney(balance)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
            <p className="mt-2 text-xs text-muted-foreground">
              Salários e patrocínio entram a cada 4 rodadas; os meses fora do calendário e a
              premiação, no fim da temporada.
            </p>
          </CardContent>
        </Card>

        {past.length > 0 && (
          <Card className="gap-3 self-start">
            <CardHeader>
              <CardTitle>Temporadas anteriores</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableBody>
                  {past.map((h) => {
                    const net = Object.values(h.userFinances!).reduce((a, b) => a + b, 0)
                    return (
                      <TableRow key={h.year}>
                        <TableCell>{h.year}</TableCell>
                        <TableCell className={cn('text-right', signed(net))}>
                          {formatMoney(net)}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Últimos lançamentos</CardTitle>
        </CardHeader>
        <CardContent>
          {ledger.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lançamento nesta temporada.</p>
          ) : (
            <Table>
              <TableBody>
                {[...ledger]
                  .reverse()
                  .slice(0, RECENT)
                  .map((entry, i) => (
                    <TableRow key={i}>
                      <TableCell className="w-12 text-muted-foreground tabular-nums">
                        {formatDayMonth(entry.date)}
                      </TableCell>
                      <TableCell className="whitespace-normal">
                        {LEDGER_NAMES[entry.category]}
                        <span className="block text-xs text-muted-foreground">{entry.note}</span>
                      </TableCell>
                      <TableCell className={cn('text-right', signed(entry.amount))}>
                        {formatMoney(entry.amount)}
                      </TableCell>
                    </TableRow>
                  ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** The ground: capacity, the expected crowd and the ticket price. */
export function StadiumPanel() {
  const game = useGame()
  const setGame = useGameStore((s) => s.setGame)
  const club = game.world.clubs[game.userClubId]
  const standing = standingsShare(game)[game.userClubId] ?? 0.5
  const crowd = attendance(club, standing)
  const fair = fairTicketPrice(club.reputation)
  const gate = averageGate(game.ledger)
  const setPrice = (price: number) => setGame(setTicketPrice(game, price))

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Figure
          label="Capacidade"
          value={`${club.stadiumCapacity.toLocaleString('pt-BR')} lugares`}
        />
        <Figure
          label="Público previsto"
          value={`${crowd.toLocaleString('pt-BR')} (${Math.round((100 * crowd) / club.stadiumCapacity)}%)`}
        />
        <Figure
          label="Renda média por jogo em casa"
          value={gate === undefined ? 'Sem jogos ainda' : formatMoney(gate)}
        />
      </div>
      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Ingressos</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Label htmlFor="ticket-price">Preço do ingresso (R$)</Label>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="icon"
              aria-label="Baixar R$ 5"
              onClick={() => setPrice(club.ticketPrice - 5)}
            >
              <MinusIcon />
            </Button>
            <Input
              id="ticket-price"
              type="number"
              inputMode="numeric"
              min={1}
              className="w-24 text-center"
              key={club.ticketPrice}
              defaultValue={club.ticketPrice}
              onBlur={(e) => setPrice(Number(e.target.value) || club.ticketPrice)}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            <Button
              variant="outline"
              size="icon"
              aria-label="Subir R$ 5"
              onClick={() => setPrice(club.ticketPrice + 5)}
            >
              <PlusIcon />
            </Button>
            <Button variant="link" onClick={() => setPrice(fair)}>
              Preço justo: {formatReais(fair)}
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Com esse preço, a renda prevista é de {formatMoney(crowd * club.ticketPrice)} por jogo
            em casa. O público cresce com a boa fase e cai com ingresso caro.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}

function Figure(props: { label: string; value: string }) {
  return (
    <Card className="gap-1 px-4 py-3">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <span className="text-lg font-bold tabular-nums">{props.value}</span>
    </Card>
  )
}

/** Bars of income and costs for each month of the season. */
function MonthChart(props: { months: MonthTotals[]; current?: MonthTotals }) {
  const top = Math.max(1, ...props.months.flatMap((m) => [m.income, m.costs]))
  const height = (value: number) => `${(100 * value) / top}%`
  return (
    <div>
      <ul
        className="flex h-36 items-end gap-1 border-b sm:gap-2"
        aria-label="Receitas e despesas por mês"
      >
        {props.months.map((m) => {
          const name = MONTH_NAMES[m.month - 1]
          return (
            <li
              key={`${m.year}-${m.month}`}
              className={cn(
                'flex h-full min-w-0 flex-1 items-end justify-center gap-0.5 rounded-t px-0.5',
                m === props.current && 'bg-muted',
              )}
              aria-label={`${name} de ${m.year}: receitas de ${formatMoney(m.income)}, despesas de ${formatMoney(m.costs)}`}
              title={`${name}: receitas de ${formatMoney(m.income)}, despesas de ${formatMoney(m.costs)}`}
            >
              <span
                className="w-full max-w-4 rounded-t-sm bg-green-600 dark:bg-green-400"
                style={{ height: height(m.income) }}
              />
              <span
                className="w-full max-w-4 rounded-t-sm bg-destructive"
                style={{ height: height(m.costs) }}
              />
            </li>
          )
        })}
      </ul>
      <div className="mt-1 flex gap-1 sm:gap-2" aria-hidden>
        {props.months.map((m) => (
          <span
            key={`${m.year}-${m.month}`}
            className="min-w-0 flex-1 text-center text-xs text-muted-foreground"
          >
            {MONTH_NAMES[m.month - 1].slice(0, 3)}
          </span>
        ))}
      </div>
      <p className="mt-2 flex gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-green-600 dark:bg-green-400" /> Receitas
        </span>
        <span className="flex items-center gap-1">
          <span className="size-2.5 rounded-sm bg-destructive" /> Despesas
        </span>
      </p>
    </div>
  )
}

function Stat(props: { label: string; value: number }) {
  return (
    <Card className="gap-1 px-4 py-3">
      <span className="text-xs text-muted-foreground">{props.label}</span>
      <span className={cn('text-lg font-bold', signed(props.value))}>
        {formatMoney(props.value)}
      </span>
    </Card>
  )
}
