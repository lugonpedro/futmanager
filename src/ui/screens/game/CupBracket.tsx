import { Card } from '@/components/ui/card'
import { CUP_NAME, cupProgress, nextCupTie } from '../../../engine/season/cup.ts'
import { useGame } from '../../../store/game.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { formatDayDate, formatShortDate } from '../../format.ts'
import { FixtureLine } from './FixtureLine.tsx'

/** Shown in place of the cup for saves from before the cup existed. */
export function NoCup() {
  return (
    <Card className="px-4">
      <p className="text-sm text-muted-foreground">
        A {CUP_NAME} desta temporada começou antes desta versão do jogo. Ela volta na próxima
        temporada.
      </p>
    </Card>
  )
}

/** The user's campaign and every stage of the cup, drawn or still to be drawn. */
export function CupBracket() {
  const game = useGame()
  const { season, world, userClubId } = game
  const { cup } = season
  if (!cup) return <NoCup />
  const progress = cupProgress(cup, userClubId)
  const next = nextCupTie(cup, userClubId)
  const opponent = next && world.clubs[next.homeId === userClubId ? next.awayId : next.homeId]

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-1 px-4">
        <h2 className="font-semibold">{CUP_NAME}</h2>
        <p className="text-sm text-muted-foreground">
          Mata-mata em jogo único com todos os 40 clubes. Empate vai para os pênaltis. Cada fase é
          jogada numa quarta-feira e vale premiação para quem passa.
        </p>
        {progress && <p className="text-sm">Sua campanha: {progress}.</p>}
        {next && opponent && (
          <p className="text-sm">
            Próximo jogo, {formatDayDate(next.date)}:{' '}
            {next.homeId === userClubId ? 'em casa contra' : 'fora contra'}{' '}
            <ClubName club={opponent} />
          </p>
        )}
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {cup.stages.map((stage) => (
          <Card key={stage.name} className="gap-2 px-3">
            <h3 className="flex flex-wrap items-baseline justify-between gap-2 font-semibold">
              {stage.name}
              <span className="text-xs font-normal text-muted-foreground">
                {formatShortDate(stage.date)}
              </span>
            </h3>
            {stage.ties.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sorteio ao fim da fase anterior.</p>
            ) : (
              <ul className="flex flex-col gap-1">
                {stage.ties.map((tie) => (
                  <li key={tie.id}>
                    <FixtureLine fixture={tie} world={world} userClubId={userClubId} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        ))}
      </div>
    </div>
  )
}
