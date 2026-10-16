import { useState } from 'react'
import { toast } from 'sonner'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'
import {
  FREE_AGENT,
  POSITIONS,
  type GameState,
  type Player,
  type Position,
} from '../../../engine/model/types.ts'
import {
  acceptOffer,
  askingPrice,
  canLeave,
  rejectOffer,
  wageDemand,
} from '../../../engine/transfer/market.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { Choices } from '../../components/Choices.tsx'
import { ClubName } from '../../components/ClubName.tsx'
import { TransferWindowNote } from '../../components/TransferWindowNote.tsx'
import { careerGames, potentialRange } from '../../../engine/progression/progression.ts'
import { formatDate, formatDayMonth, formatMoney, POSITION_NAMES, rangeText } from '../../format.ts'
import { SignDialog } from './MarketDialogs.tsx'
import { PlayerSheet } from './PlayerSheet.tsx'

const SHOWN = 50
const SORTS = { Geral: 'overall', Preço: 'price', Idade: 'age' } as const
type Sort = keyof typeof SORTS

const TABS = ['contratar', 'propostas', 'noticias']

/** Players from other clubs: buying, bids for the user's players and the transfer news. */
export function MarketScreen() {
  const game = useGame()
  const navigate = useNavigate()
  const { tab } = useParams()
  const offers = game.market.offers.length
  if (tab && !TABS.includes(tab)) return <Navigate to="/jogo/mercado" replace />
  return (
    <Tabs value={tab ?? 'contratar'} onValueChange={(value) => navigate(`/jogo/mercado/${value}`)}>
      <TabsList>
        <TabsTrigger value="contratar">Contratar</TabsTrigger>
        <TabsTrigger value="propostas">
          Propostas
          {offers > 0 && <Badge className="h-5 min-w-5 px-1">{offers}</Badge>}
        </TabsTrigger>
        <TabsTrigger value="noticias">Movimentações</TabsTrigger>
      </TabsList>
      <TabsContent value="contratar">
        <BuyTab game={game} />
      </TabsContent>
      <TabsContent value="propostas">
        <OffersTab game={game} />
      </TabsContent>
      <TabsContent value="noticias">
        <NewsTab game={game} />
      </TabsContent>
    </Tabs>
  )
}

function BuyTab({ game }: { game: GameState }) {
  const { world, userClubId } = game
  const [position, setPosition] = useState<Position | 'Todos'>('Todos')
  const [search, setSearch] = useState('')
  const [onlyAffordable, setOnlyAffordable] = useState<'Todos' | 'Cabem no caixa'>('Todos')
  const [sort, setSort] = useState<Sort>('Geral')
  const [selected, setSelected] = useState<Player>()
  const [viewing, setViewing] = useState<Player>()
  const cash = world.clubs[userClubId].cash
  const query = search.trim().toLocaleLowerCase('pt-BR')

  const rows = Object.values(world.players)
    .filter((p) => p.clubId !== userClubId)
    .filter((p) => position === 'Todos' || p.position === position)
    .filter((p) => !query || p.name.toLocaleLowerCase('pt-BR').includes(query))
    .filter((p) => canLeave(world, p))
    .map((p) => ({ player: p, price: askingPrice(game, p) }))
    .filter((r) => onlyAffordable === 'Todos' || r.price <= cash)
    .sort((a, b) =>
      sort === 'Preço'
        ? a.price - b.price
        : sort === 'Idade'
          ? a.player.age - b.player.age
          : b.player.overall - a.player.overall,
    )

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Choices
          ariaLabel="Posição"
          options={['Todos', ...POSITIONS] as const}
          value={position}
          onChange={setPosition}
          title={(p) => (p === 'Todos' ? 'Todas as posições' : POSITION_NAMES[p])}
        />
        <Choices
          ariaLabel="Preço"
          options={['Todos', 'Cabem no caixa'] as const}
          value={onlyAffordable}
          onChange={setOnlyAffordable}
        />
        <Choices
          ariaLabel="Ordenar por"
          options={Object.keys(SORTS) as Sort[]}
          value={sort}
          onChange={setSort}
        />
        <Input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar jogador"
          className="h-8 sm:max-w-60"
        />
      </div>
      <TransferWindowNote today={game.today} />
      <p className="text-sm text-muted-foreground">
        {rows.length > SHOWN ? `Mostrando ${SHOWN} de ${rows.length}` : `${rows.length}`} jogadores.
        Caixa: {formatMoney(cash)}. Toque no nome para ver a carta, ou na linha para negociar.
      </p>
      <Card className="py-0">
        <Table className="tabular-nums">
          <TableHeader>
            <TableRow>
              <TableHead>Pos</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden sm:table-cell">Idade</TableHead>
              <TableHead>Geral</TableHead>
              <TableHead className="hidden sm:table-cell">Pot</TableHead>
              <TableHead>Clube</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Salário pedido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.slice(0, SHOWN).map(({ player, price }) => (
              <TableRow
                key={player.id}
                className="cursor-pointer"
                onClick={() => setSelected(player)}
              >
                <TableCell className="font-semibold">{player.position}</TableCell>
                <TableCell>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      setViewing(player)
                    }}
                    className="cursor-pointer text-left font-medium hover:underline"
                  >
                    {player.name}
                  </button>
                </TableCell>
                <TableCell className="hidden sm:table-cell">{player.age}</TableCell>
                <TableCell className="font-bold">{player.overall}</TableCell>
                <TableCell className="hidden whitespace-nowrap text-muted-foreground sm:table-cell">
                  {rangeText(potentialRange(player, careerGames(player, game.season.appearances)))}
                </TableCell>
                <TableCell className="max-w-40">
                  {player.clubId === FREE_AGENT ? (
                    <Badge variant="secondary">Sem clube</Badge>
                  ) : (
                    <ClubName club={world.clubs[player.clubId]} short />
                  )}
                </TableCell>
                <TableCell className={cn('text-right', price > cash && 'text-destructive')}>
                  {price === 0 ? 'Livre' : formatMoney(price)}
                </TableCell>
                <TableCell className="hidden text-right sm:table-cell">
                  {formatMoney(wageDemand(world, player, userClubId))}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {selected && (
        <SignDialog game={game} player={selected} onClose={() => setSelected(undefined)} />
      )}
      {viewing && (
        <PlayerSheet game={game} player={viewing} onClose={() => setViewing(undefined)} />
      )}
    </div>
  )
}

function OffersTab({ game }: { game: GameState }) {
  const setGame = useGameStore((s) => s.setGame)
  const [error, setError] = useState<string>()
  const { world, market } = game
  if (market.offers.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhuma proposta no momento. Coloque jogadores à venda em{' '}
        <Link to="/jogo/time" className="text-primary underline">
          Time
        </Link>{' '}
        para atrair ofertas. Elas só chegam com a janela de transferências aberta, em janeiro e
        julho, e valem por uma semana.
      </p>
    )
  }
  const act = (change: () => GameState, done: string) => {
    try {
      setGame(change())
      setError(undefined)
      toast.success(done)
    } catch (e) {
      setError((e as Error).message)
    }
  }
  return (
    <div className="flex flex-col gap-3">
      {error && <p className="text-sm text-destructive">{error}</p>}
      {market.offers.map((offer) => {
        const player = world.players[offer.playerId]
        return (
          <Card key={offer.id} className="flex-row flex-wrap items-center gap-3 px-4">
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="font-semibold">
                {player.name}{' '}
                <span className="text-sm font-normal text-muted-foreground">
                  ({player.position}, {player.overall})
                </span>
              </span>
              <span className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <ClubName club={world.clubs[offer.clubId]} /> oferece{' '}
                <strong className="text-foreground">{formatMoney(offer.fee)}</strong> (valor de
                mercado {formatMoney(player.marketValue)}), válida até{' '}
                {formatDayMonth(offer.expires)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() =>
                  act(
                    () => acceptOffer(game, offer.id),
                    `${player.name} vendido para o ${world.clubs[offer.clubId].name} por ${formatMoney(offer.fee)}.`,
                  )
                }
              >
                Aceitar
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  act(
                    () => rejectOffer(game, offer.id),
                    `Proposta do ${world.clubs[offer.clubId].name} por ${player.name} recusada.`,
                  )
                }
              >
                Recusar
              </Button>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

function NewsTab({ game }: { game: GameState }) {
  const { world, market, userClubId } = game
  if (market.news.length === 0) {
    return <p className="text-sm text-muted-foreground">Nenhuma transferência ainda.</p>
  }
  const clubLabel = (id: string) =>
    id === FREE_AGENT ? (
      <span className="text-muted-foreground">sem clube</span>
    ) : (
      <ClubName club={world.clubs[id]} highlight={id === userClubId} />
    )
  return (
    <Card className="py-0">
      <Table>
        <TableBody>
          {market.news.map((n, i) => (
            <TableRow key={i}>
              <TableCell className="text-muted-foreground tabular-nums">
                {formatDate(n.date)}
              </TableCell>
              <TableCell>
                {world.players[n.playerId].name}{' '}
                <span className="text-xs text-muted-foreground">
                  {world.players[n.playerId].position}
                </span>
              </TableCell>
              <TableCell className="max-w-36">{clubLabel(n.fromClubId)}</TableCell>
              <TableCell className="max-w-36">{clubLabel(n.toClubId)}</TableCell>
              <TableCell className="text-right tabular-nums">
                {n.fee === 0 ? 'Livre' : formatMoney(n.fee)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  )
}
