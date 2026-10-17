import { Fragment, type ReactNode } from 'react'

/**
 * On phones, a small line under a name with what the hidden columns would
 * show; from `sm` up the columns come back and the line goes away. It
 * breaks only between parts.
 */
export function RowDetails(props: { children: ReactNode[] }) {
  return (
    <div className="mt-0.5 text-xs font-normal whitespace-normal text-muted-foreground sm:hidden">
      {props.children.map((part, i) => (
        <Fragment key={i}>
          {i > 0 && ' · '}
          <span className="whitespace-nowrap">{part}</span>
        </Fragment>
      ))}
    </div>
  )
}
