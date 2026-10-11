import { cn } from '@/lib/utils'

/** The board's mood in a word, from its confidence. */
function confidenceWord(confidence: number): string {
  if (confidence >= 70) return 'Ótima'
  if (confidence >= 45) return 'Boa'
  if (confidence >= 25) return 'Instável'
  return 'Crítica'
}

/** A bar for the board's confidence, green when safe and red when the job is at risk. */
export function ConfidenceBar({ confidence }: { confidence: number }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div
        role="meter"
        aria-label="Confiança da diretoria"
        aria-valuenow={confidence}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
      >
        <div
          className={cn(
            'h-full rounded-full transition-all',
            confidence >= 45 ? 'bg-pitch' : confidence >= 25 ? 'bg-highlight' : 'bg-destructive',
          )}
          style={{ width: `${confidence}%` }}
        />
      </div>
      <span className="w-24 text-right tabular-nums text-muted-foreground">
        {confidenceWord(confidence)} ({confidence}%)
      </span>
    </div>
  )
}
