import { BadgeDollarSignIcon, FileSignatureIcon, PlaneIcon } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { FavoriteStar } from '../../components/FavoriteStar.tsx'
import {
  FREE_AGENT,
  type GameState,
  type Player,
  type Position,
  type TacticalRole,
  type TrainingIntensity,
  type TrainingPlan,
} from '../../../engine/model/types.ts'
import { cupScorers } from '../../../engine/season/cup.ts'
import { careerGames, potentialRange } from '../../../engine/progression/progression.ts'
import { recoveryRate, TRAINING, trainingBlock } from '../../../engine/progression/training.ts'
import { isOnLoan, LOAN } from '../../../engine/transfer/loans.ts'
import { conditionOn, formOf, seasonRating } from '../../../engine/season/form.ts'
import { leagueOf, leagueScorers } from '../../../engine/season/season.ts'
import { Choices } from '../../components/Choices.tsx'
import { FocusSelect } from '../../components/FocusSelect.tsx'
import { PlayerCard } from '../../components/PlayerCard.tsx'
import {
  PlayerSheetView,
  SheetItem as Item,
  SheetSection as Section,
} from '../../components/PlayerSheetView.tsx'
import {
  formatMoney,
  INDIVIDUAL_FOCUS_NAMES,
  INTENSITY_NAMES,
  isHomegrown,
  ROLE_NAMES,
  roundStarFeats,
  type Role,
} from '../../format.ts'

/**
 * A player's card in a side drawer, as the career shows it: the shared sheet
 * plus how he is doing this season, past seasons and the contract. The sell
 * and renew actions show for the user's own players, and so does his
 * training plan when the caller can change it.
 */
export function PlayerSheet(props: {
  game: GameState
  player: Player
  role?: Role
  slot?: { position: Position; role?: TacticalRole }
  onClose: () => void
  onSell?: () => void
  onRenew?: () => void
  onLoan?: () => void
  onTrain?: (plan: TrainingPlan | undefined) => void
}) {
  const { game, player, role } = props
  const { world, season, market, userClubId } = game
  const own = player.clubId === userClubId
  const loaned = isOnLoan(game, player.id)
  const listed = market.listed[player.id]
  const leagueGoals =
    player.clubId === FREE_AGENT
      ? 0
      : (leagueScorers(game, leagueOf(world, player.clubId)).find((r) => r.playerId === player.id)
          ?.goals ?? 0)
  const cupGoals = cupScorers(season.cup).find((r) => r.playerId === player.id)?.goals ?? 0
  const expiring = (own || loaned) && player.contractUntil <= season.year
  const rating = seasonRating(season, player.id)
  const club = world.clubs[player.clubId]
  const star = season.roundStars.find((s) => s.playerId === player.id)

  return (
    <PlayerSheetView
      player={player}
      onClose={props.onClose}
      subtitle={club ? club.name : 'sem clube'}
      titleExtra={<FavoriteStar player={player} />}
      badges={
        <>
          {role && (
            <Badge variant={role === 'titular' ? 'default' : 'secondary'}>{ROLE_NAMES[role]}</Badge>
          )}
          {isHomegrown(player, player.clubId) && <Badge variant="outline">Base</Badge>}
        </>
      }
      availability={{
        injured: season.injuries[player.id],
        suspended: season.suspensions[player.id],
        yellows: season.yellowCards[player.id],
      }}
      card={<PlayerCard player={player} game={game} />}
      notes={
        <>
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
        </>
      }
      potential={potentialRange(player, careerGames(player, season.appearances))}
      growth={game.growth?.overall[player.id]}
      slot={props.slot}
      condition={conditionOn(season, player, game.today, recoveryRate(game, player.id))}
      form={formOf(season, player.id)}
      facts={
        <>
          {own &&
            (props.onTrain && !trainingBlock(player) ? (
              <Item label="Treino" wide>
                <TrainingPicker
                  player={player}
                  plan={game.training.individual[player.id]}
                  onChange={props.onTrain}
                />
              </Item>
            ) : (
              <Item label="Treino">
                <TrainingNote player={player} plan={game.training.individual[player.id]} />
              </Item>
            ))}
          <Item label="Nota média">{rating?.toFixed(1) ?? '-'}</Item>
          <Item label="Jogos">{season.ratings[player.id]?.games ?? 0}</Item>
          <Item label="Gols na liga">{leagueGoals}</Item>
          <Item label="Gols na copa">{cupGoals}</Item>
        </>
      }
      sections={
        <>
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
        </>
      }
      footer={
        (own || loaned) &&
        props.onRenew && (
          <>
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
          </>
        )
      }
    />
  )
}

const INTENSITIES = Object.keys(INTENSITY_NAMES) as TrainingIntensity[]

/** His own plan, to change right on the card: what to work on and how hard. */
function TrainingPicker(props: {
  player: Player
  plan: TrainingPlan | undefined
  onChange: (plan: TrainingPlan | undefined) => void
}) {
  const { player, plan, onChange } = props
  return (
    <div className="mt-1 flex flex-wrap items-center gap-2 font-normal">
      <FocusSelect player={player} plan={plan} onChange={onChange} />
      <Choices
        ariaLabel={`Intensidade de ${player.name}`}
        options={INTENSITIES}
        value={plan?.intensity}
        disabled={!plan}
        onChange={(intensity) => plan && onChange({ ...plan, intensity })}
        label={(intensity) => INTENSITY_NAMES[intensity].name}
        title={(intensity) => INTENSITY_NAMES[intensity].detail}
      />
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
