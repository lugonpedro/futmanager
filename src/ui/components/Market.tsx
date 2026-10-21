import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDownIcon, ArrowUpIcon, XIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import type { DraftTeam } from '../../cloud/draft.ts'
import type { Room } from '../../cloud/rooms.ts'
import {
  acceptTrade,
  claimPlayer,
  dropTrade,
  loadClaims,
  loadFeed,
  loadOpenTrades,
  orderClaims,
  proposeTrade,
  releaseRoomPlayer,
  unclaimPlayer,
  type FeedEntry,
  type RoomClaim,
  type RosterEntry,
  type RoomTrade,
} from '../../cloud/roomMarket.ts'
import { POSITIONS, type Position } from '../../engine/model/types.ts'
import type { PoolPlayer } from '../../engine/room/start.ts'
import { ROOM_LIMITS } from '../../engine/room/types.ts'
import { confirm } from '../confirm.ts'
import { moveInQueue, searchKey } from '../draft.ts'
import { POSITION_NAMES, POSITION_ORDER } from '../format.ts'
import { feedLine, freePlayers, squadIds, tradesOpen } from '../roomMarket.ts'
import { Choices } from './Choices.tsx'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

type Tab = 'Livres' | 'Trocas' | 'Mural'
const TABS: Tab[] = ['Livres', 'Trocas', 'Mural']

/** Free players shown at once; the search finds the rest. */
const SHOWN = 15

type Loaded = { claims: RoomClaim[]; trades: RoomTrade[]; feed: FeedEntry[] }

/**
 * The room's market, with no money: claims for free players, settled before
 * each round with the worst placed first; trades between people, made the
 * moment the other side accepts; releases; and the feed of what happened.
 */
export function MarketView(props: {
  room: Room
  teams: DraftTeam[]
  mine?: DraftTeam
  pool: PoolPlayer[]
  rosters: RosterEntry[]
  /** Changes whenever the market changes on the server. */
  tick: number
}) {
  const { room, mine, rosters } = props
  const [tab, setTab] = useState<Tab>('Livres')
  const [loaded, setLoaded] = useState<Loaded>()

  const load = useCallback(
    () =>
      Promise.all([
        mine ? loadClaims(room.id) : Promise.resolve([]),
        mine ? loadOpenTrades(room.id) : Promise.resolve([]),
        loadFeed(room.id),
      ]).then(([claims, trades, feed]) => setLoaded({ claims, trades, feed })),
    [room.id, mine],
  )
  useEffect(() => {
    // Moves come in bursts of rows; wait for the burst to end.
    const timer = setTimeout(() => void load().catch(() => {}), props.tick === 0 ? 0 : 400)
    return () => clearTimeout(timer)
  }, [load, props.tick])

  const byId = useMemo(() => new Map(props.pool.map((p) => [p.id, p])), [props.pool])
  const teamName = (slot: number) => props.teams.find((t) => t.slot === slot)?.name ?? '?'
  const playerName = (id: string) => byId.get(id)?.name ?? '?'
  const pending = loaded?.trades.filter((t) => t.toSlot === mine?.slot).length ?? 0

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mercado</CardTitle>
        <CardDescription>
          Sem dinheiro: peça jogadores livres, troque com os amigos ou dispense quem não quer mais.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <Choices
          ariaLabel="Parte do mercado"
          options={TABS}
          value={tab}
          onChange={setTab}
          label={(t) => (t === 'Trocas' && pending > 0 ? `Trocas (${pending})` : t)}
        />
        {!loaded ? (
          <p className="text-sm text-muted-foreground">Carregando o mercado…</p>
        ) : tab === 'Livres' ? (
          <FreeAgents
            room={room}
            mine={mine}
            pool={props.pool}
            byId={byId}
            rosters={rosters}
            claims={loaded.claims}
            onChange={load}
          />
        ) : tab === 'Trocas' ? (
          <Trades
            room={room}
            teams={props.teams}
            mine={mine}
            byId={byId}
            rosters={rosters}
            trades={loaded.trades}
            teamName={teamName}
            onChange={load}
          />
        ) : loaded.feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Ninguém mexeu no elenco ainda.</p>
        ) : (
          <ul className="flex flex-col gap-1 text-sm">
            {loaded.feed.map((entry) => (
              <li key={entry.id} className="flex gap-2">
                <span className="w-8 shrink-0 text-xs text-muted-foreground tabular-nums">
                  R{entry.round}
                </span>
                <span>{feedLine(entry, teamName, playerName)}</span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

/** "M Fulano 78", for a player in a list or a select. */
const label = (p: PoolPlayer | undefined) => (p ? `${p.position} ${p.name} ${p.overall}` : '?')

const byPosition = (a: PoolPlayer, b: PoolPlayer) =>
  POSITION_ORDER[a.position] - POSITION_ORDER[b.position] || b.overall - a.overall

function FreeAgents(props: {
  room: Room
  mine?: DraftTeam
  pool: PoolPlayer[]
  byId: ReadonlyMap<string, PoolPlayer>
  rosters: RosterEntry[]
  claims: RoomClaim[]
  onChange: () => Promise<void>
}) {
  const { room, mine, byId, claims } = props
  const round = room.round?.no ?? 0
  const [search, setSearch] = useState('')
  const [position, setPosition] = useState<Position>()
  const [claiming, setClaiming] = useState<string>()
  const [busy, setBusy] = useState(false)
  const squad = mine
    ? squadIds(props.rosters, mine.slot)
        .map((id) => byId.get(id)!)
        .filter(Boolean)
        .sort(byPosition)
    : []
  const full = squad.length >= room.options.squadSize
  const free = freePlayers(props.pool, props.rosters, round)
  const key = searchKey(search)
  const shown = free
    .filter((p) => (!position || p.position === position) && searchKey(p.name).includes(key))
    .slice(0, SHOWN)
  const claimed = new Set(claims.map((c) => c.playerId))

  const run = async (work: () => Promise<void>, done?: string) => {
    setBusy(true)
    try {
      await work()
      await props.onChange()
      if (done) toast.success(done)
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setBusy(false)
    }
  }
  const release = async (id: string) => {
    const player = byId.get(id)
    const ok = await confirm({
      title: `Dispensar ${player?.name}?`,
      description:
        'Ele sai do seu elenco agora e volta para os livres. Ninguém pode pedi-lo nesta rodada, nem você.',
      action: 'Dispensar',
    })
    if (ok) await run(() => releaseRoomPlayer(room.id, id), `${player?.name} foi dispensado.`)
  }

  return (
    <div className="flex flex-col gap-4">
      {mine && claims.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Seus pedidos</h3>
          <ol className="flex flex-col gap-1 text-sm">
            {claims.map((claim, i) => (
              <li key={claim.playerId} className="flex items-center gap-2">
                <span className="w-4 text-right text-muted-foreground">{i + 1}</span>
                <span className="min-w-0 flex-1 truncate">
                  {label(byId.get(claim.playerId))}
                  {claim.releaseId && (
                    <span className="text-muted-foreground">
                      {' '}
                      no lugar de {byId.get(claim.releaseId)?.name}
                    </span>
                  )}
                </span>
                {(
                  [
                    [-1, ArrowUpIcon, 'Subir'],
                    [1, ArrowDownIcon, 'Descer'],
                  ] as const
                ).map(([step, Icon, name]) => (
                  <Button
                    key={step}
                    size="icon"
                    variant="ghost"
                    className="size-7"
                    aria-label={`${name} ${byId.get(claim.playerId)?.name}`}
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        orderClaims(
                          room.id,
                          moveInQueue(
                            claims.map((c) => c.playerId),
                            claim.playerId,
                            step,
                          ),
                        ),
                      )
                    }
                  >
                    <Icon />
                  </Button>
                ))}
                <Button
                  size="icon"
                  variant="ghost"
                  className="size-7"
                  aria-label={`Tirar o pedido de ${byId.get(claim.playerId)?.name}`}
                  disabled={busy}
                  onClick={() => run(() => unclaimPlayer(room.id, claim.playerId))}
                >
                  <XIcon />
                </Button>
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">
            Os pedidos são resolvidos antes da próxima rodada: o pior colocado escolhe primeiro, e
            quem leva um jogador vai para o fim da fila. Até {ROOM_LIMITS.claimsPerRound} por rodada
            para cada time, tentados nesta ordem.
          </p>
        </section>
      )}

      <section className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Choices
            ariaLabel="Filtrar por posição"
            options={['Todos', ...POSITIONS]}
            value={position ?? 'Todos'}
            onChange={(v) => setPosition(v === 'Todos' ? undefined : (v as Position))}
            title={(v) => (v === 'Todos' ? 'Todas as posições' : POSITION_NAMES[v as Position])}
          />
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar jogador livre"
            className="h-8 sm:max-w-48"
          />
        </div>
        <ul className="flex flex-col">
          {shown.map((player) => (
            <li
              key={player.id}
              className="flex min-h-11 flex-col justify-center gap-2 border-b py-1 last:border-b-0"
            >
              <div className="flex items-center gap-2 text-sm">
                <span className="w-4 font-semibold" title={POSITION_NAMES[player.position]}>
                  {player.position}
                </span>
                <span className="min-w-0 flex-1 truncate">
                  {player.name}{' '}
                  <span className="text-xs text-muted-foreground">
                    {player.age} anos, {player.origin}
                  </span>
                </span>
                <span className="w-6 text-right font-semibold tabular-nums">{player.overall}</span>
                {mine && (
                  <span className="flex w-20 shrink-0 justify-end text-right text-xs text-muted-foreground">
                    {player.from ? (
                      `na rodada ${player.from}`
                    ) : claimed.has(player.id) ? (
                      'pedido'
                    ) : (
                      <Button
                        size="sm"
                        variant={claiming === player.id ? 'default' : 'outline'}
                        onClick={() => setClaiming(claiming === player.id ? undefined : player.id)}
                      >
                        Pedir
                      </Button>
                    )}
                  </span>
                )}
              </div>
              {claiming === player.id && (
                <ClaimForm
                  squad={squad}
                  full={full}
                  busy={busy}
                  onCancel={() => setClaiming(undefined)}
                  onClaim={(releaseId) =>
                    run(async () => {
                      await claimPlayer(room.id, { playerId: player.id, releaseId })
                      setClaiming(undefined)
                    }, `Pedido de ${player.name} guardado.`)
                  }
                />
              )}
            </li>
          ))}
          {shown.length === 0 && (
            <li className="text-sm text-muted-foreground">Nenhum jogador livre com esse filtro.</li>
          )}
        </ul>
      </section>

      {mine && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Dispensar</h3>
          <ReleaseForm squad={squad} busy={busy} onRelease={release} />
        </section>
      )}
    </div>
  )
}

function ClaimForm(props: {
  squad: PoolPlayer[]
  full: boolean
  busy: boolean
  onCancel: () => void
  onClaim: (releaseId?: string) => void
}) {
  const [out, setOut] = useState('')
  const needsOut = props.full && !out
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md bg-muted/50 p-2 text-sm">
      <label className="flex w-full min-w-0 items-center gap-2 sm:w-auto sm:flex-1">
        <span className="shrink-0 text-muted-foreground">Sai</span>
        <select
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2"
          value={out}
          onChange={(e) => setOut(e.target.value)}
        >
          <option value="">{props.full ? 'Escolha quem sai' : 'Ninguém (há vaga)'}</option>
          {props.squad.map((p) => (
            <option key={p.id} value={p.id}>
              {label(p)}
            </option>
          ))}
        </select>
      </label>
      <Button size="sm" variant="ghost" className="ml-auto sm:ml-0" onClick={props.onCancel}>
        Cancelar
      </Button>
      <Button
        size="sm"
        disabled={props.busy || needsOut}
        onClick={() => props.onClaim(out || undefined)}
      >
        Guardar pedido
      </Button>
    </div>
  )
}

function ReleaseForm(props: {
  squad: PoolPlayer[]
  busy: boolean
  onRelease: (id: string) => void
}) {
  const [id, setId] = useState('')
  return (
    <div className="flex flex-wrap items-center gap-2 text-sm">
      <select
        className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2"
        value={id}
        onChange={(e) => setId(e.target.value)}
        aria-label="Jogador a dispensar"
      >
        <option value="">Escolha um jogador do seu elenco</option>
        {props.squad.map((p) => (
          <option key={p.id} value={p.id}>
            {label(p)}
          </option>
        ))}
      </select>
      <Button
        size="sm"
        variant="outline"
        disabled={props.busy || !id}
        onClick={() => props.onRelease(id)}
      >
        Dispensar
      </Button>
    </div>
  )
}

function Trades(props: {
  room: Room
  teams: DraftTeam[]
  mine?: DraftTeam
  byId: ReadonlyMap<string, PoolPlayer>
  rosters: RosterEntry[]
  trades: RoomTrade[]
  teamName: (slot: number) => string
  onChange: () => Promise<void>
}) {
  const { room, mine, byId, trades, teamName } = props
  const [busy, setBusy] = useState(false)
  if (!mine) return <p className="text-sm text-muted-foreground">Só quem tem time troca.</p>
  const open = tradesOpen(room)
  const names = (ids: string[]) => ids.map((id) => label(byId.get(id))).join(', ')
  const received = trades.filter((t) => t.toSlot === mine.slot)
  const sent = trades.filter((t) => t.fromSlot === mine.slot)

  const run = async (work: () => Promise<void>, done: string) => {
    setBusy(true)
    try {
      await work()
      await props.onChange()
      toast.success(done)
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      {!open && (
        <p className="text-sm text-muted-foreground">
          {room.options.trades === 'desligadas'
            ? 'As trocas estão desligadas nesta sala.'
            : 'As trocas fecharam: nesta sala elas valem até dois terços da liga.'}
        </p>
      )}
      {received.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Propostas para você</h3>
          {received.map((t) => (
            <div key={t.id} className="flex flex-col gap-2 rounded-md border p-2 text-sm">
              <p>
                <strong>{teamName(t.fromSlot)}</strong> oferece {names(t.give)} por {names(t.take)}.
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() => run(() => acceptTrade(t.id), 'Troca feita.')}
                >
                  Aceitar
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => run(() => dropTrade(t.id), 'Proposta recusada.')}
                >
                  Recusar
                </Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            A troca vale na hora. Os dois times perdem o &quot;Pronto&quot;, porque o elenco mudou.
          </p>
        </section>
      )}
      {sent.length > 0 && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Suas propostas</h3>
          {sent.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-2 text-sm">
              <p className="min-w-0 flex-1">
                Para <strong>{teamName(t.toSlot)}</strong>: {names(t.give)} por {names(t.take)}.
              </p>
              <Button
                size="sm"
                variant="ghost"
                disabled={busy}
                onClick={() => run(() => dropTrade(t.id), 'Proposta cancelada.')}
              >
                Cancelar
              </Button>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">
            Uma proposta sem resposta vence quando a rodada é jogada.
          </p>
        </section>
      )}
      {open && (
        <TradeForm
          room={room}
          teams={props.teams}
          mine={mine}
          byId={byId}
          rosters={props.rosters}
          busy={busy}
          onPropose={(to, give, take) =>
            run(() => proposeTrade(room.id, to, give, take), 'Proposta enviada.')
          }
        />
      )}
    </div>
  )
}

function TradeForm(props: {
  room: Room
  teams: DraftTeam[]
  mine: DraftTeam
  byId: ReadonlyMap<string, PoolPlayer>
  rosters: RosterEntry[]
  busy: boolean
  onPropose: (to: number, give: string[], take: string[]) => Promise<void>
}) {
  const partners = props.teams.filter((t) => !t.robot && t.userId && t.slot !== props.mine.slot)
  const [to, setTo] = useState<number | undefined>(partners[0]?.slot)
  const [give, setGive] = useState<string[]>([])
  const [take, setTake] = useState<string[]>([])
  if (partners.length === 0)
    return <p className="text-sm text-muted-foreground">Não há outra pessoa na sala para trocar.</p>

  const squad = (slot: number) =>
    squadIds(props.rosters, slot)
      .map((id) => props.byId.get(id)!)
      .filter(Boolean)
      .sort(byPosition)
  const max = ROOM_LIMITS.maxTradePlayers
  const toggle = (list: string[], set: (next: string[]) => void, id: string) =>
    set(list.includes(id) ? list.filter((x) => x !== id) : list.length < max ? [...list, id] : list)
  const ready = give.length > 0 && give.length === take.length && to !== undefined

  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">Propor uma troca</h3>
      <label className="flex items-center gap-2 text-sm">
        <span className="text-muted-foreground">Com</span>
        <select
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2"
          value={to}
          onChange={(e) => {
            setTo(Number(e.target.value))
            setTake([])
          }}
        >
          {partners.map((t) => (
            <option key={t.slot} value={t.slot}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <PickList
          title={`Você dá (${give.length})`}
          players={squad(props.mine.slot)}
          picked={give}
          onToggle={(id) => toggle(give, setGive, id)}
        />
        {to !== undefined && (
          <PickList
            title={`Você recebe (${take.length})`}
            players={squad(to)}
            picked={take}
            onToggle={(id) => toggle(take, setTake, id)}
          />
        )}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={props.busy || !ready}
          onClick={async () => {
            await props.onPropose(to!, give, take)
            setGive([])
            setTake([])
          }}
        >
          Propor troca
        </Button>
        <p className="text-xs text-muted-foreground">
          De 1 a {max} jogadores de cada lado, o mesmo número dos dois, e cada elenco com{' '}
          {ROOM_LIMITS.minKeepers} goleiros depois.
        </p>
      </div>
    </section>
  )
}

function PickList(props: {
  title: string
  players: PoolPlayer[]
  picked: string[]
  onToggle: (id: string) => void
}) {
  return (
    <div className="flex flex-col gap-1">
      <h4 className="text-xs font-semibold text-muted-foreground uppercase">{props.title}</h4>
      <ul className="flex max-h-64 flex-col overflow-y-auto rounded-md border">
        {props.players.map((p) => {
          const on = props.picked.includes(p.id)
          return (
            <li key={p.id}>
              <button
                type="button"
                aria-pressed={on}
                onClick={() => props.onToggle(p.id)}
                className={cn(
                  'flex w-full items-center gap-2 px-2 py-1 text-left text-sm hover:bg-accent',
                  on && 'bg-yellow-300 text-green-950 hover:bg-yellow-300',
                )}
              >
                <span className="w-4 font-semibold">{p.position}</span>
                <span className="min-w-0 flex-1 truncate">{p.name}</span>
                <span className="w-6 text-right tabular-nums">{p.overall}</span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
