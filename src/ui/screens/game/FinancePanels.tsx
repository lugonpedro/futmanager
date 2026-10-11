import { MinusIcon, PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Table, TableBody, TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { attendance, fairTicketPrice, monthlySponsorship } from '../../../engine/finance/economy.ts'
import {
  ledgerTotals,
  setTicketPrice,
  standingsShare,
  wageBill,
} from '../../../engine/finance/finance.ts'
import type { LedgerCategory } from '../../../engine/model/types.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { formatMoney, formatReais, LEDGER_NAMES } from '../../format.ts'

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
        <Stat label="Patrocínio por mês" value={monthlySponsorship(club)} />
      </div>

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
                        {entry.round}ª
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
  const setPrice = (price: number) => setGame(setTicketPrice(game, price))

  return (
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
          Público previsto: {crowd.toLocaleString('pt-BR')} de{' '}
          {club.stadiumCapacity.toLocaleString('pt-BR')} lugares (
          {Math.round((100 * crowd) / club.stadiumCapacity)}%), renda de{' '}
          {formatMoney(crowd * club.ticketPrice)} por jogo em casa. O público cresce com a boa fase
          e cai com ingresso caro.
        </p>
      </CardContent>
    </Card>
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
