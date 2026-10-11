import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { FREE_AGENT, type GameState, type Player } from '../../../engine/model/types.ts'
import {
  askingPrice,
  checkRenewal,
  checkSigning,
  listPlayer,
  MARKET,
  renewalDemand,
  renewContract,
  signPlayer,
  wageDemand,
} from '../../../engine/transfer/market.ts'
import { useGameStore } from '../../../store/game.ts'
import { Choices } from '../../components/Choices.tsx'
import { MoneyInput } from '../../components/MoneyInput.tsx'
import { formatMoney, POSITION_NAMES, TRAIT_NAMES } from '../../format.ts'

const YEARS = Array.from({ length: MARKET.maxContractYears }, (_, i) => String(i + 1))

function PlayerSummary({ game, player }: { game: GameState; player: Player }) {
  return (
    <p className="text-sm text-muted-foreground">
      {POSITION_NAMES[player.position]}, {player.age} anos, força {player.strength} (potencial{' '}
      {player.potential})
      {player.traits.length > 0 && `, ${player.traits.map((t) => TRAIT_NAMES[t]).join(', ')}`}.{' '}
      {player.clubId === FREE_AGENT
        ? 'Sem clube.'
        : `${game.world.clubs[player.clubId].name}, contrato até ${player.contractUntil}.`}
    </p>
  )
}

/** Offer a fee to the player's club and terms to the player. */
export function SignDialog(props: { game: GameState; player: Player; onClose: () => void }) {
  const { game, player } = props
  const setGame = useGameStore((s) => s.setGame)
  const asking = askingPrice(game, player)
  const demand = wageDemand(game.world, player, game.userClubId)
  const [fee, setFee] = useState(asking)
  const [wage, setWage] = useState(demand)
  const [years, setYears] = useState('2')
  const [error, setError] = useState<string>()
  const cash = game.world.clubs[game.userClubId].cash

  const submit = () => {
    const bid = { fee, wage, years: Number(years) }
    const verdict = checkSigning(game, player.id, bid)
    if (!verdict.ok) return setError(verdict.reason)
    setGame(signPlayer(game, player.id, bid))
    props.onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Contratar {player.name}</DialogTitle>
          <DialogDescription asChild>
            <div>
              <PlayerSummary game={game} player={player} />
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          {player.clubId !== FREE_AGENT && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="fee">Proposta ao clube (pede {formatMoney(asking)})</Label>
              <MoneyInput id="fee" value={fee} onChange={setFee} />
            </div>
          )}
          <div className="flex flex-col gap-2">
            <Label htmlFor="wage">Salário mensal (pede {formatMoney(demand)})</Label>
            <MoneyInput id="wage" value={wage} onChange={setWage} step={1000} />
          </div>
          <div className="flex flex-col gap-2 sm:col-span-2">
            <span className="text-sm font-medium">Temporadas de contrato</span>
            <Choices ariaLabel="Temporadas" options={YEARS} value={years} onChange={setYears} />
          </div>
        </div>
        <p className="text-sm text-muted-foreground">
          Custo no primeiro ano: {formatMoney(fee + wage * 12)} (transferência mais 12 salários).
          Caixa: {formatMoney(cash)}.
        </p>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Cancelar
          </Button>
          <Button onClick={submit}>Fazer proposta</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Put a player up for sale at a price, or take him off the list. */
export function ListDialog(props: { game: GameState; player: Player; onClose: () => void }) {
  const { game, player } = props
  const setGame = useGameStore((s) => s.setGame)
  const listed = game.market.listed[player.id]
  const [price, setPrice] = useState(listed ?? player.marketValue)
  const save = (value?: number) => {
    setGame(listPlayer(game, player.id, value))
    props.onClose()
  }
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Vender {player.name}</DialogTitle>
          <DialogDescription asChild>
            <div>
              <PlayerSummary game={game} player={player} />
            </div>
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="price">
            Preço pedido (valor de mercado {formatMoney(player.marketValue)})
          </Label>
          <MoneyInput id="price" value={price} onChange={setPrice} />
        </div>
        <p className="text-sm text-muted-foreground">
          Clubes interessados mandam propostas depois das rodadas, perto do preço pedido. Preço alto
          atrai menos compradores com dinheiro.
        </p>
        <DialogFooter>
          {listed !== undefined && (
            <Button variant="outline" onClick={() => save(undefined)}>
              Tirar da venda
            </Button>
          )}
          <Button onClick={() => save(price)}>
            {listed === undefined ? 'Colocar à venda' : 'Mudar preço'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Extend a contract by a few seasons at the wage the player wants. */
export function RenewDialog(props: { game: GameState; player: Player; onClose: () => void }) {
  const { game, player } = props
  const setGame = useGameStore((s) => s.setGame)
  const demand = renewalDemand(game.world, player)
  const [wage, setWage] = useState(demand)
  const [years, setYears] = useState('2')
  const [error, setError] = useState<string>()
  const until = Math.max(player.contractUntil, game.season.year) + Number(years)
  const submit = () => {
    const verdict = checkRenewal(game, player.id, wage, Number(years))
    if (!verdict.ok) return setError(verdict.reason)
    setGame(renewContract(game, player.id, wage, Number(years)))
    props.onClose()
  }
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Renovar com {player.name}</DialogTitle>
          <DialogDescription>
            Hoje ganha {formatMoney(player.wage)} por mês, com contrato até {player.contractUntil}.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <Label htmlFor="renew-wage">Novo salário mensal (pede {formatMoney(demand)})</Label>
          <MoneyInput id="renew-wage" value={wage} onChange={setWage} step={1000} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Temporadas a mais</span>
          <Choices
            ariaLabel="Temporadas a mais"
            options={YEARS}
            value={years}
            onChange={setYears}
          />
          <span className="text-xs text-muted-foreground">Novo contrato até {until}.</span>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Cancelar
          </Button>
          <Button onClick={submit}>Renovar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
