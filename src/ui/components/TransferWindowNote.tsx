import { currentOrNextWindow } from '../../engine/season/calendar.ts'
import { formatDayMonth } from '../format.ts'

/** Whether players with a club can be signed today, and until or from when. */
export function TransferWindowNote(props: { today: string; className?: string }) {
  const window = currentOrNextWindow(props.today)
  const open = window.from <= props.today
  return (
    <p className={props.className ?? 'text-sm text-muted-foreground'}>
      {open ? (
        <>
          <span className="font-semibold text-green-700 dark:text-green-400">
            Janela de transferências aberta
          </span>{' '}
          até {formatDayMonth(window.to)}.
        </>
      ) : (
        <>
          Janela de transferências fechada: só dá para contratar jogador sem clube. Abre em{' '}
          {formatDayMonth(window.from)}.
        </>
      )}
    </p>
  )
}
