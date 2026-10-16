import { Card } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import type { LiveStats, MatchSide } from '../../engine/match/simulate.ts'

const ROWS: { key: keyof LiveStats; label: string }[] = [
  { key: 'possession', label: 'Posse de bola (%)' },
  { key: 'shots', label: 'Finalizações' },
  { key: 'shotsOnTarget', label: 'No gol' },
  { key: 'fouls', label: 'Faltas' },
  { key: 'yellowCards', label: 'Amarelos' },
  { key: 'redCards', label: 'Vermelhos' },
]

/** The match in numbers, each one as a bar split between the two sides. */
export function MatchStats(props: {
  stats: Record<MatchSide, LiveStats>
  names: Record<MatchSide, string>
}) {
  const { home, away } = props.stats
  return (
    <Card className="gap-3 px-4 py-3">
      <h2 className="font-semibold">Estatísticas</h2>
      <div className="flex justify-between text-xs text-muted-foreground">
        <span className="truncate">{props.names.home}</span>
        <span className="truncate text-right">{props.names.away}</span>
      </div>
      <ul className="flex flex-col gap-2.5">
        {ROWS.map(({ key, label }) => {
          const total = home[key] + away[key]
          const share = total ? (100 * home[key]) / total : 50
          return (
            <li
              key={key}
              className="flex flex-col gap-1"
              aria-label={`${label}: ${home[key]} a ${away[key]}`}
            >
              <div className="flex items-baseline justify-between text-sm tabular-nums" aria-hidden>
                <span className="w-8 font-semibold">{home[key]}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="w-8 text-right font-semibold">{away[key]}</span>
              </div>
              <div className="flex h-1.5 gap-0.5 overflow-hidden rounded-full" aria-hidden>
                <span
                  className={cn('rounded-l-full', total ? 'bg-primary' : 'bg-muted')}
                  style={{ width: `${share}%` }}
                />
                <span
                  className={cn(
                    'flex-1 rounded-r-full',
                    total ? 'bg-muted-foreground/60' : 'bg-muted',
                  )}
                />
              </div>
            </li>
          )
        })}
      </ul>
    </Card>
  )
}
