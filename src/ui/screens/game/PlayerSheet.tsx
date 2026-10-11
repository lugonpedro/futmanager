import { BadgeDollarSignIcon, FileSignatureIcon } from 'lucide-react'
import type { ReactNode } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { GameState, Player, Position } from '../../../engine/model/types.ts'
import { positionFit } from '../../../engine/match/strength.ts'
import { cupScorers } from '../../../engine/season/cup.ts'
import { leagueOf, leagueScorers } from '../../../engine/season/season.ts'
import { PlayerStatus } from '../../components/PlayerStatus.tsx'
import {
  fitClass,
  formatMoney,
  isHomegrown,
  POSITION_NAMES,
  ROLE_NAMES,
  TRAIT_NAMES,
  type Role,
} from '../../format.ts'

/**
 * A player's card in a side drawer: who he is, how he is doing this season
 * and the contract actions. Phase 10 fills it with the full FC-style card.
 */
export function PlayerSheet(props: {
  game: GameState
  player: Player
  role: Role
  slot?: Position
  onClose: () => void
  onSell: () => void
  onRenew: () => void
}) {
  const { game, player, role, slot } = props
  const { world, season, market, userClubId } = game
  const listed = market.listed[player.id]
  const leagueGoals =
    leagueScorers(game, leagueOf(world, userClubId)).find((r) => r.playerId === player.id)?.goals ??
    0
  const cupGoals = cupScorers(season.cup).find((r) => r.playerId === player.id)?.goals ?? 0
  const expiring = player.contractUntil <= season.year
  const fit = slot && positionFit(player, slot)

  return (
    <Sheet open onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent side="right" className="w-80 gap-0 overflow-y-auto sm:max-w-sm">
        <SheetHeader className="pr-10">
          <div className="flex items-center gap-3">
            <div className="flex size-16 shrink-0 flex-col items-center justify-center rounded-lg bg-gradient-to-b from-pitch to-pitch-dark text-white">
              <span className="text-2xl leading-none font-bold tabular-nums">
                {player.strength}
              </span>
              <span className="text-xs font-semibold">{player.position}</span>
            </div>
            <div className="flex min-w-0 flex-col gap-1">
              <SheetTitle className="text-lg leading-tight">{player.name}</SheetTitle>
              <SheetDescription>
                {POSITION_NAMES[player.position]}, {player.age} anos
              </SheetDescription>
              <span className="flex flex-wrap gap-1">
                <Badge variant={role === 'titular' ? 'default' : 'secondary'}>
                  {ROLE_NAMES[role]}
                </Badge>
                {isHomegrown(player, userClubId) && <Badge variant="outline">Base</Badge>}
                <PlayerStatus playerId={player.id} season={season} />
              </span>
            </div>
          </div>
        </SheetHeader>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-2 text-sm">
          <Item label="Força">{player.strength}</Item>
          <Item label="Potencial">{player.potential}</Item>
          {slot && fit !== undefined && (
            <Item label="Jogando de" wide>
              <span className={fitClass(fit)}>
                {POSITION_NAMES[slot]}
                {fit < 1 && `, rende ${Math.round(fit * 100)}%`}
              </span>
            </Item>
          )}
          <Item label="Características" wide>
            {player.traits.map((t) => TRAIT_NAMES[t]).join(', ') || 'Nenhuma'}
          </Item>
          <Item label="Gols na liga">{leagueGoals}</Item>
          <Item label="Gols na copa">{cupGoals}</Item>
          <Item label="Salário">{formatMoney(player.wage)}/mês</Item>
          <Item label="Valor de mercado">{formatMoney(player.marketValue)}</Item>
          <Item label="Contrato até">
            <span className={cn(expiring && 'font-semibold text-destructive')}>
              {player.contractUntil}
            </span>
          </Item>
          <Item label="À venda">{listed === undefined ? 'Não' : formatMoney(listed)}</Item>
        </dl>
        {expiring && (
          <p className="px-4 text-sm text-destructive">
            O contrato termina no fim desta temporada: renove ou ele sai de graça.
          </p>
        )}

        <SheetFooter className="flex-row flex-wrap">
          <Button variant="outline" onClick={props.onSell}>
            <BadgeDollarSignIcon />
            {listed === undefined ? 'Colocar à venda' : 'Preço de venda'}
          </Button>
          <Button variant="outline" onClick={props.onRenew}>
            <FileSignatureIcon />
            Renovar contrato
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

function Item(props: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex flex-col', props.wide && 'col-span-2')}>
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className="font-medium tabular-nums">{props.children}</dd>
    </div>
  )
}
