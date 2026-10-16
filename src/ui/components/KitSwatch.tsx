import type { Kit } from '../kits.ts'

/** A small square in the colours a side wears in this match. */
export function KitSwatch(props: { kit: Kit; className?: string }) {
  return (
    <span
      aria-hidden
      className={`inline-block size-3 shrink-0 rounded-[3px] border-2 ${props.className ?? ''}`}
      style={{ background: props.kit.fill, borderColor: props.kit.line }}
    />
  )
}
