import type { Season } from '../../engine/model/types.ts'
import { YELLOWS_FOR_SUSPENSION } from '../../engine/season/season.ts'

/** Why a player can't play, or how close they are to a ban, as small tags. */
export function PlayerStatus(props: { playerId: string; season: Season }) {
  const { playerId, season } = props
  const injured = season.injuries[playerId]
  const suspended = season.suspensions[playerId]
  const yellows = season.yellowCards[playerId]
  return (
    <span className="inline-flex flex-wrap gap-1 text-xs">
      {injured && (
        <span
          className="rounded bg-orange-500/20 px-1 text-orange-700 dark:text-orange-200"
          title={`Lesionado, volta em ${injured} ${injured === 1 ? 'rodada' : 'rodadas'}`}
        >
          lesão {injured}
        </span>
      )}
      {suspended && (
        <span
          className="rounded bg-red-500/20 px-1 text-red-700 dark:text-red-200"
          title={`Suspenso por ${suspended} ${suspended === 1 ? 'rodada' : 'rodadas'}`}
        >
          suspenso
        </span>
      )}
      {yellows && (
        <span
          className="rounded bg-yellow-400/25 px-1 text-amber-800 dark:text-yellow-200"
          title={`${yellows} de ${YELLOWS_FOR_SUSPENSION} amarelos para suspensão`}
        >
          {yellows} amarelo{yellows > 1 ? 's' : ''}
        </span>
      )}
    </span>
  )
}
