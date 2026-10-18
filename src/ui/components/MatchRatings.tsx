import { useState } from 'react'
import { StarIcon } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { MatchSide, MatchState } from '../../engine/match/simulate.ts'
import type { Player } from '../../engine/model/types.ts'
import type { Kit } from '../kits.ts'
import { Choices } from './Choices.tsx'
import { KitSwatch } from './KitSwatch.tsx'

/** Colour of a rating: good from 7, poor below 5.5. */
function ratingClass(rating: number) {
  if (rating >= 7) return 'text-green-600 dark:text-green-400'
  if (rating < 5.5) return 'text-destructive'
  return ''
}

/**
 * Ratings of everyone who has played, one side at a time, starting with the
 * user's. At the final whistle the best on the pitch gets a star.
 */
export function MatchRatings(props: {
  state: MatchState
  ratings: Record<string, number>
  players: Readonly<Record<string, Player>>
  side: MatchSide
  kits: Record<MatchSide, Kit>
  best?: string
  className?: string
}) {
  const { state, ratings } = props
  const [side, setSide] = useState(props.side)
  const team = state[side]
  const names = { home: state.home.club.shortName, away: state.away.club.shortName }
  const onPitch = new Set(team.onPitch.map((p) => p.player.id))
  const sentOff = new Set(state.sentOff)
  const booked = new Set(team.onPitch.filter((p) => p.booked).map((p) => p.player.id))

  return (
    <Card className={cn('gap-3 px-4 py-3', props.className)}>
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 font-semibold">
          Notas
          <KitSwatch kit={props.kits[side]} />
        </h2>
        <Choices
          ariaLabel="Time"
          options={['home', 'away'] as const}
          label={(s) => names[s]}
          value={side}
          onChange={setSide}
        />
      </div>
      <ul className="flex flex-col text-sm">
        {Object.entries(team.played).map(([id, position]) => {
          const name = props.players[id]?.name ?? ''
          const out = !onPitch.has(id)
          return (
            <li
              key={id}
              className={cn(
                'flex items-center gap-2 rounded px-1 py-0.5',
                id === props.best && 'bg-highlight-soft font-semibold',
              )}
            >
              <span className="w-4 text-xs text-muted-foreground">{position}</span>
              <span className={cn('min-w-0 flex-1 truncate', out && 'text-muted-foreground')}>
                {name}
                {booked.has(id) && (
                  <span
                    className="ml-1 inline-block h-3 w-2 rounded-[1px] bg-amber-400 align-middle"
                    title="Amarelo"
                  />
                )}
                {sentOff.has(id) && (
                  <span
                    className="ml-1 inline-block h-3 w-2 rounded-[1px] bg-red-600 align-middle"
                    title="Expulso"
                  />
                )}
                {out && !sentOff.has(id) && <span className="ml-1 text-xs">(saiu)</span>}
              </span>
              {id === props.best && (
                <StarIcon
                  className="size-4 fill-current text-highlight"
                  aria-label="Melhor em campo"
                />
              )}
              <span className={cn('w-8 text-right tabular-nums', ratingClass(ratings[id] ?? 6))}>
                {(ratings[id] ?? 6).toFixed(1)}
              </span>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
