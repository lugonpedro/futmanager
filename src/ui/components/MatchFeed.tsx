import { useEffect, useRef } from 'react'
import type { MatchEvent } from '../../engine/model/types.ts'

const EVENT_STYLE: Partial<Record<MatchEvent['type'], string>> = {
  gol: 'font-bold text-yellow-300',
  amarelo: 'text-yellow-100',
  vermelho: 'font-semibold text-red-300',
  lesao: 'text-orange-200',
  inicio: 'italic text-green-200',
  intervalo: 'italic text-green-200',
  fim: 'font-semibold text-green-100',
}

/** Narrated events, newest at the bottom, kept scrolled to the latest. */
export function MatchFeed(props: { events: readonly MatchEvent[]; className?: string }) {
  const feedRef = useRef<HTMLOListElement>(null)
  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  }, [props.events.length])

  return (
    <ol
      ref={feedRef}
      className={`flex flex-col gap-1 overflow-y-auto text-sm ${props.className ?? 'max-h-80'}`}
    >
      {props.events.map((event, i) => (
        <li key={i} className={EVENT_STYLE[event.type] ?? 'text-green-50'}>
          <span className="mr-2 inline-block w-8 text-right text-green-300 tabular-nums">
            {event.minute}'
          </span>
          {event.text}
        </li>
      ))}
    </ol>
  )
}
