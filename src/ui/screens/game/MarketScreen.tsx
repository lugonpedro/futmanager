import { useState } from 'react'
import { toast } from 'sonner'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
  type GameState,
  type Player,
  type TransferOffer,
} from '../../../engine/model/types.ts'
import { acceptOffer, rejectOffer } from '../../../engine/transfer/market.ts'
import { inTransferWindow } from '../../../engine/season/calendar.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { Choices } from '../../components/Choices.tsx'
import { ClubName } from '../../components/ClubName.tsx'
import { Pager } from '../../components/Pager.tsx'
import { FilterField, PlayerFilterBar } from '../../components/PlayerFilterBar.tsx'
import { RowDetails } from '../../components/RowDetails.tsx'
import { TransferWindowNote } from '../../components/TransferWindowNote.tsx'
import { usePage } from '../../usePage.ts'
import { divisionName, formatDate, formatDayMonth, formatMoney, rangeText } from '../../format.ts'
import {
  activeFilters,
  MARKET_SORTS,
  marketRows,
  SITUATIONS,
  type Situation,
} from '../../marketFilter.ts'
import { useMarketFilters } from '../../../store/marketFilters.ts'
import { confirm } from '../../confirm.ts'
import { FavoriteStar } from '../../components/FavoriteStar.tsx'
import { SignDialog } from './MarketDialogs.tsx'
import { PlayerSheet } from './PlayerSheet.tsx'

const PAGE_SIZE = 25
const NEWS_PAGE_SIZE = 20

/** What each situation filter keeps, for its tooltip. */
const SITUATION_NOTES: Record<Situation, string> = {
  Todos: 'Todos os jogadores',
  'Sem clube': 'Sem clube: contrata pagando só o salário',
  'Contrato no fim': 'Contrato termina nesta temporada',
  Favoritos: 'Os que você marcou com a estrela',
}

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
      <div className="flex flex-wrap items-center justify-between gap-2">
        <TabsList>
          <TabsTrigger value="contratar">Contratar</TabsTrigger>
          <TabsTrigger value="propostas">
            Propostas
            {offers > 0 && <Badge className="h-5 min-w-5 px-1">{offers}</Badge>}
          </TabsTrigger>
          <TabsTrigger value="noticias">Movimentações</TabsTrigger>
        </TabsList>
      </div>
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
  const { filters, setFilters, clearFilters } = useMarketFilters()
  const [selected, setSelected] = useState<Player>()
  const [viewing, setViewing] = useState<Player>()
  // With the window shut only free agents can sign, so they are all the list shows unless asked.
  const [browsing, setBrowsing] = useState(false)
  const open = inTransferWindow(game.today)
  const signable = (p: Player) => open || p.clubId === FREE_AGENT
  const cash = world.clubs[userClubId].cash
  const divisions = [...new Set(Object.values(world.clubs).map((c) => c.division))].sort()
  const active = activeFilters(filters)

  const rows = marketRows(game, filters, (p) => browsing || signable(p))
  const paged = usePage(rows, PAGE_SIZE, `${JSON.stringify(filters)}|${browsing}`)

  return (
    <div className="flex flex-col gap-3">
      <PlayerFilterBar
        filters={filters}
        onChange={setFilters}
        sort={{
          options: MARKET_SORTS,
          value: filters.sort,
          onChange: (sort) => setFilters({ sort }),
        }}
        active={active}
        onClear={clearFilters}
        quick={
          <Choices
            ariaLabel="Situação"
            options={SITUATIONS}
            value={filters.situation}
            onChange={(situation) => setFilters({ situation })}
            title={(s) => SITUATION_NOTES[s]}
            label={(s) => (s === 'Todos' ? 'Qualquer situação' : s)}
          />
        }
        more={
          <>
            <FilterField label="Divisão">
              <Choices
                ariaLabel="Divisão"
                options={['Todas', ...divisions.map(String)]}
                value={filters.division === undefined ? 'Todas' : String(filters.division)}
                onChange={(d) => setFilters({ division: d === 'Todas' ? undefined : Number(d) })}
                label={(d) => (d === 'Todas' ? d : divisionName(Number(d)))}
              />
            </FilterField>
            <FilterField label="Preço">
              <Choices
                ariaLabel="Preço"
                options={['Todos', 'Cabem no caixa'] as const}
                value={filters.affordable ? 'Cabem no caixa' : 'Todos'}
                onChange={(v) => setFilters({ affordable: v === 'Cabem no caixa' })}
              />
            </FilterField>
          </>
        }
      />
      {open ? (
        <TransferWindowNote today={game.today} />
      ) : (
        <Card className="flex-row flex-wrap items-center justify-between gap-3 border-amber-500/40 bg-amber-500/10 px-4 py-3">
          <TransferWindowNote today={game.today} className="text-sm" />
          <Button variant="outline" size="sm" onClick={() => setBrowsing((b) => !b)}>
            {browsing ? 'Só os sem clube' : 'Ver todos para observar'}
          </Button>
        </Card>
      )}
      {rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {open || browsing
            ? 'Nenhum jogador com esses filtros.'
            : 'Nenhum jogador sem clube com esses filtros. Em "Ver todos para observar" dá para montar a lista de quem contratar quando a janela abrir.'}
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">
          {rows.length} {rows.length === 1 ? 'jogador' : 'jogadores'}
          {!open && !browsing && ' sem clube'}. Caixa: {formatMoney(cash)}. Toque no nome para ver a
          carta, na estrela para favoritar, ou na linha
          {open || !browsing ? '' : ' de quem está sem clube'} para negociar.
        </p>
      )}
      <Card className={cn('py-0', rows.length === 0 && 'hidden')}>
        <Table className="tabular-nums">
          <TableHeader>
            <TableRow>
              <TableHead>Pos</TableHead>
              <TableHead>Nome</TableHead>
              <TableHead className="hidden sm:table-cell">Idade</TableHead>
              <TableHead title="Geral e potencial">Geral</TableHead>
              <TableHead className="hidden sm:table-cell">Clube</TableHead>
              <TableHead className="text-right">Preço</TableHead>
              <TableHead className="hidden text-right sm:table-cell">Salário pedido</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {paged.items.map(({ player, price, wage, potential }) => {
              return (
                <TableRow
                  key={player.id}
                  className={signable(player) ? 'cursor-pointer' : 'opacity-50'}
                  onClick={() => signable(player) && setSelected(player)}
                  title={signable(player) ? undefined : 'Só com a janela aberta'}
                >
                  <TableCell className="font-semibold">{player.position}</TableCell>
                  {/* On phones long names wrap, so the price stays on screen. */}
                  <TableCell className="whitespace-normal sm:whitespace-nowrap">
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
                    <FavoriteStar player={player} className="ml-0.5 align-middle" />
                    <RowDetails>
                      {[
                        player.clubId === FREE_AGENT
                          ? 'sem clube'
                          : world.clubs[player.clubId].shortName,
                        `${player.age} anos`,
                        `pede ${formatMoney(wage)}`,
                      ]}
                    </RowDetails>
                  </TableCell>
                  <TableCell className="hidden sm:table-cell">{player.age}</TableCell>
                  <TableCell
                    className="whitespace-nowrap"
                    title={`Geral ${player.overall}, potencial ${rangeText(potential)}`}
                  >
                    <span className="font-bold">{player.overall}</span>
                    <span className="text-xs text-muted-foreground">/{potential.high}</span>
                  </TableCell>
                  <TableCell className="hidden max-w-40 sm:table-cell">
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
                    {formatMoney(wage)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </Card>
      <Pager paged={paged} />
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
  const accept = async (offer: TransferOffer) => {
    const player = world.players[offer.playerId]
    if (game.favorites.includes(player.id)) {
      const ok = await confirm({
        title: `Vender ${player.name}?`,
        description: `${player.name} está nos seus favoritos. Vender para o ${world.clubs[offer.clubId].name} por ${formatMoney(offer.fee)} mesmo assim?`,
        action: 'Vender',
        destructive: true,
      })
      if (!ok) return
    }
    act(
      () => acceptOffer(game, offer.id),
      `${player.name} vendido para o ${world.clubs[offer.clubId].name} por ${formatMoney(offer.fee)}.`,
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
              <span className="flex flex-wrap items-center gap-x-2 gap-y-1 font-semibold">
                <span>
                  {player.name}{' '}
                  <span className="text-sm font-normal text-muted-foreground">
                    ({player.position}, {player.overall})
                  </span>
                </span>
                <SaleBadge offer={offer} />
              </span>
              <span className="flex flex-wrap items-center gap-1 text-sm text-muted-foreground">
                <ClubName club={world.clubs[offer.clubId]} /> oferece{' '}
                <strong className="text-foreground">{formatMoney(offer.fee)}</strong> (valor de
                mercado {formatMoney(player.marketValue)}), válida até{' '}
                {formatDayMonth(offer.expires)}
              </span>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => accept(offer)}>Aceitar</Button>
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

/**
 * Whether the player was up for sale when the bid came in, and how the bid
 * compares to the asking price, as the toast said when it arrived.
 */
function SaleBadge({ offer }: { offer: TransferOffer }) {
  if (offer.askingPrice === undefined) {
    return (
      <Badge variant="outline" title="O clube fez a proposta sem o jogador estar à venda">
        Não estava à venda
      </Badge>
    )
  }
  const gap = offer.askingPrice > 0 ? Math.round((offer.fee / offer.askingPrice - 1) * 100) : 0
  return (
    <Badge variant="secondary" title={`Você pedia ${formatMoney(offer.askingPrice)}`}>
      À venda por {formatMoney(offer.askingPrice)}
      {gap !== 0 && (
        <span className={gap < 0 ? 'text-destructive' : 'text-green-700 dark:text-green-400'}>
          {gap < 0 ? `${-gap}% abaixo` : `${gap}% acima`}
        </span>
      )}
    </Badge>
  )
}

function NewsTab({ game }: { game: GameState }) {
  const { world, market, userClubId } = game
  const paged = usePage(market.news, NEWS_PAGE_SIZE)
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
    <div className="flex flex-col gap-3">
      <Card className="py-0">
        <Table>
          <TableBody>
            {paged.items.map((n, i) => (
              <TableRow key={paged.start + i}>
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
      <Pager paged={paged} />
    </div>
  )
}
