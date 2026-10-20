import type { Season } from '../../engine/model/types.ts'
import type { GameDate } from '../../engine/season/calendar.ts'
import { YELLOWS_FOR_SUSPENSION } from '../../engine/season/season.ts'
import { formatDayDate, formatDayMonth } from '../format.ts'

/** Whether a player is out or close to a ban, wherever it is counted. */
export type PlayerAvailability = {
  /** The day he can play again, when injured. */
  injured?: GameDate
  /** Matches still to sit out. */
  suspended?: number
  /** Yellow cards towards the next ban. */
  yellows?: number
}

/** Why a player can't play, or how close they are to a ban, as small tags. */
export function PlayerStatus({ playerId, season }: { playerId: string; season: Season }) {
  return (
    <AvailabilityTags
      injured={season.injuries[playerId]}
      suspended={season.suspensions[playerId]}
      yellows={season.yellowCards[playerId]}
    />
  )
}

/** The tags of {@link PlayerStatus}, from the availability alone. */
export function AvailabilityTags({ injured, suspended, yellows }: PlayerAvailability) {
  // An empty tag box would still take a line where the name wraps.
  if (!injured && !suspended && !yellows) return null
  return (
    <span className="inline-flex flex-wrap gap-1 text-xs">
      {injured && (
        <span
          className="rounded bg-orange-500/20 px-1 text-orange-700 dark:text-orange-200"
          title={`Lesionado, volta a jogar em ${formatDayDate(injured)}`}
        >
          lesão até {formatDayMonth(injured)}
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
