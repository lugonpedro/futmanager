import { BadgeDollarSignIcon, FileSignatureIcon, PlaneIcon } from 'lucide-react'
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
import {
  FREE_AGENT,
  type GameState,
  type Player,
  type Position,
  type TrainingPlan,
} from '../../../engine/model/types.ts'
import { positionFit } from '../../../engine/match/strength.ts'
import {
  FACE_ATTRIBUTES,
  faceValue,
  FACES,
  KEEPER_FACES,
} from '../../../engine/player/attributes.ts'
import { cupScorers } from '../../../engine/season/cup.ts'
import { careerGames, potentialRange } from '../../../engine/progression/progression.ts'
import { recoveryRate, TRAINING, trainingBlock } from '../../../engine/progression/training.ts'
import { isOnLoan, LOAN } from '../../../engine/transfer/loans.ts'
import { conditionOn, formOf, seasonRating } from '../../../engine/season/form.ts'
import { leagueOf, leagueScorers } from '../../../engine/season/season.ts'
import { PlayerCard } from '../../components/PlayerCard.tsx'
import { PlayerStatus } from '../../components/PlayerStatus.tsx'
import {
  ATTRIBUTE_NAMES,
  FACE_NAMES,
  fitClass,
  FOOT_NAMES,
  formatMoney,
  INDIVIDUAL_FOCUS_NAMES,
  INTENSITY_NAMES,
  isHomegrown,
  POSITION_NAMES,
  rangeText,
  ROLE_NAMES,
  roundStarFeats,
  signedChange,
  type Role,
} from '../../format.ts'

/**
 * A player's card in a side drawer: the card itself, how he is doing this
 * season, every attribute with a bar, past seasons and the contract. The
 * sell and renew actions show for the user's own players.
 */
export function PlayerSheet(props: {
  game: GameState
  player: Player
  role?: Role
  slot?: Position
  onClose: () => void
  onSell?: () => void
  onRenew?: () => void
  onLoan?: () => void
}) {
  const { game, player, role, slot } = props
  const { world, season, market, userClubId } = game
  const own = player.clubId === userClubId
  const loaned = isOnLoan(game, player.id)
  const potential = potentialRange(player, careerGames(player, season.appearances))
  const growth = game.growth?.overall[player.id]
  const listed = market.listed[player.id]
  const leagueGoals =
    player.clubId === FREE_AGENT
      ? 0
      : (leagueScorers(game, leagueOf(world, player.clubId)).find((r) => r.playerId === player.id)
          ?.goals ?? 0)
  const cupGoals = cupScorers(season.cup).find((r) => r.playerId === player.id)?.goals ?? 0
  const expiring = (own || loaned) && player.contractUntil <= season.year
  const fit = slot && positionFit(player, slot)
  const rating = seasonRating(season, player.id)
  const form = formOf(season, player.id)
  const condition = conditionOn(season, player, game.today, recoveryRate(game, player.id))
  const club = world.clubs[player.clubId]
  const star = season.roundStars.find((s) => s.playerId === player.id)

  return (
    <Sheet open onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-10">
          <SheetTitle className="text-lg leading-tight">{player.name}</SheetTitle>
          <SheetDescription>
            {POSITION_NAMES[player.position]}, {player.age} anos
            {club ? `, ${club.name}` : ', sem clube'}
          </SheetDescription>
          <span className="flex flex-wrap gap-1">
            {role && (
              <Badge variant={role === 'titular' ? 'default' : 'secondary'}>
                {ROLE_NAMES[role]}
              </Badge>
            )}
            {isHomegrown(player, player.clubId) && <Badge variant="outline">Base</Badge>}
            <PlayerStatus playerId={player.id} season={season} />
          </span>
        </SheetHeader>

        <div className="flex justify-center px-4 pb-2">
          <PlayerCard player={player} game={game} />
        </div>
        {star && (
          <p className="px-4 pb-2 text-center text-sm">
            Na seleção da rodada {season.round - 1}: {roundStarFeats(star)}.
          </p>
        )}

        {loaned && club && (
          <p className="px-4 pb-2 text-center text-sm">
            Emprestado pelo seu clube ao {club.name}; volta no fim da temporada.
          </p>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-2 text-sm sm:grid-cols-3">
          <Item label="Geral">
            {player.overall}
            {growth !== undefined && growth !== 0 && (
              <span
                className={cn(
                  'ml-1 text-xs',
                  growth > 0
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
                title="No último mês"
              >
                {signedChange(growth)} no mês
              </span>
            )}
          </Item>
          <Item label="Potencial">
            <span title="Fica mais preciso conforme ele joga">{rangeText(potential)}</span>
          </Item>
          <Item label="Pé preferido">{FOOT_NAMES[player.foot]}</Item>
          <Item label="Posições" wide>
            {[player.position, ...player.secondary].map((p) => POSITION_NAMES[p]).join(', ')}
          </Item>
          {slot && fit !== undefined && (
            <Item label="Jogando de">
              <span className={fitClass(fit)}>
                {POSITION_NAMES[slot]}
                {fit < 1 && `, rende ${Math.round(fit * 100)}%`}
              </span>
            </Item>
          )}
          <Item label="Condição física">
            <span className={cn(condition < 85 && 'text-amber-600 dark:text-yellow-300')}>
              {condition}%
            </span>
          </Item>
          <Item label="Forma">
            <FormMark form={form} />
          </Item>
          {own && (
            <Item label="Treino">
              <TrainingNote player={player} plan={game.training.individual[player.id]} />
            </Item>
          )}
          <Item label="Nota média">{rating?.toFixed(1) ?? '-'}</Item>
          <Item label="Jogos">{season.ratings[player.id]?.games ?? 0}</Item>
          <Item label="Gols na liga">{leagueGoals}</Item>
          <Item label="Gols na copa">{cupGoals}</Item>
        </dl>

        <Section title="Atributos">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {(player.position === 'G' ? KEEPER_FACES : FACES).map((face) => {
              const parts = FACE_ATTRIBUTES[face]
              const value = Math.round(faceValue(player.attributes, face))
              return (
                <div key={face} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-sm font-semibold">
                    <span>{FACE_NAMES[face].name}</span>
                    <span className="tabular-nums">{value}</span>
                  </div>
                  {parts.length === 1 ? (
                    <Bar value={value} />
                  ) : (
                    parts.map((attribute) => (
                      <AttributeBar
                        key={attribute}
                        label={ATTRIBUTE_NAMES[attribute]}
                        value={player.attributes[attribute]}
                      />
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </Section>

        {player.history && player.history.length > 0 && (
          <Section title="Temporadas">
            <table className="w-full text-sm tabular-nums">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-normal">Ano</th>
                  <th className="text-left font-normal">Clube</th>
                  <th className="text-right font-normal">Jogos</th>
                  <th className="text-right font-normal">Gols</th>
                  <th className="text-right font-normal">Nota</th>
                </tr>
              </thead>
              <tbody>
                {[...player.history].reverse().map((s) => (
                  <tr key={`${s.year}-${s.clubId}`}>
                    <td>{s.year}</td>
                    <td>{world.clubs[s.clubId]?.shortName ?? '-'}</td>
                    <td className="text-right">{s.games}</td>
                    <td className="text-right">{s.goals}</td>
                    <td className="text-right">{s.rating.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>
        )}

        <Section title="Contrato">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <Item label="Salário">{formatMoney(player.wage)}/mês</Item>
            <Item label="Valor de mercado">{formatMoney(player.marketValue)}</Item>
            <Item label="Contrato até">
              <span className={cn(expiring && 'font-semibold text-destructive')}>
                {player.clubId === FREE_AGENT ? '-' : player.contractUntil}
              </span>
            </Item>
            {own && (
              <Item label="À venda">{listed === undefined ? 'Não' : formatMoney(listed)}</Item>
            )}
          </dl>
          {expiring && (
            <p className="mt-2 text-sm text-destructive">
              O contrato termina no fim desta temporada: renove ou ele sai de graça.
            </p>
          )}
        </Section>

        {(own || loaned) && props.onRenew && (
          <SheetFooter className="flex-row flex-wrap">
            {own && props.onSell && (
              <Button variant="outline" onClick={props.onSell}>
                <BadgeDollarSignIcon />
                {listed === undefined ? 'Colocar à venda' : 'Preço de venda'}
              </Button>
            )}
            <Button variant="outline" onClick={props.onRenew}>
              <FileSignatureIcon />
              Renovar contrato
            </Button>
            {own && props.onLoan && player.age <= LOAN.maxAge && (
              <Button variant="outline" onClick={props.onLoan}>
                <PlaneIcon />
                Emprestar
              </Button>
            )}
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  )
}

const FORM_LABELS: Record<number, string> = {
  [-2]: 'Péssima',
  [-1]: 'Em baixa',
  0: 'Normal',
  1: 'Em alta',
  2: 'Ótima',
}

const FORM_ARROWS: Record<number, string> = { [-2]: '⇊', [-1]: '↓', 0: '→', 1: '↑', 2: '⇈' }

const formClass = (form: number) =>
  cn(form > 0 && 'text-green-700 dark:text-green-400', form < 0 && 'text-red-600 dark:text-red-400')

/** Form as an arrow and a word: green going up, red going down. */
export function FormMark({ form }: { form: number }) {
  return (
    <span className={formClass(form)}>
      {FORM_ARROWS[form]} {FORM_LABELS[form]}
    </span>
  )
}

/** Just the arrow, for tables. */
export function FormArrow({ form }: { form: number }) {
  return (
    <span className={formClass(form)} title={`Forma: ${FORM_LABELS[form]}`}>
      {FORM_ARROWS[form]}
    </span>
  )
}

function AttributeBar(props: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[1fr_2rem] items-center gap-x-2 text-xs">
      <span className="truncate text-muted-foreground">{props.label}</span>
      <span className="text-right font-semibold tabular-nums">{props.value}</span>
      <span className="col-span-2">
        <Bar value={props.value} />
      </span>
    </div>
  )
}

/** A 1 to 99 value as a bar, green when great and red when poor. */
function Bar({ value }: { value: number }) {
  const colour =
    value >= 80
      ? 'bg-green-600'
      : value >= 65
        ? 'bg-lime-500'
        : value >= 50
          ? 'bg-yellow-500'
          : value >= 35
            ? 'bg-orange-500'
            : 'bg-red-500'
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
      <span className={cn('block h-full rounded-full', colour)} style={{ width: `${value}%` }} />
    </span>
  )
}

function Section(props: { title: string; children: ReactNode }) {
  return (
    <section className="border-t px-4 py-3">
      <h3 className="mb-2 text-sm font-semibold">{props.title}</h3>
      {props.children}
    </section>
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

/** What the player trains on his own, or why he no longer can. */
function TrainingNote({ player, plan }: { player: Player; plan: TrainingPlan | undefined }) {
  const block = trainingBlock(player)
  if (block === 'potencial') return <span className="text-muted-foreground">Já no potencial</span>
  if (block === 'idade')
    return <span className="text-muted-foreground">Acima de {TRAINING.individualUntil} anos</span>
  if (!plan) return <span className="text-muted-foreground">Sem treino próprio</span>
  return (
    <>
      {INDIVIDUAL_FOCUS_NAMES[plan.focus]}, {INTENSITY_NAMES[plan.intensity].name.toLowerCase()}
    </>
  )
}
