import type { Club } from '../../engine/model/types.ts'

/** Club name with a small badge in its colours. */
export function ClubName(props: { club: Club; short?: boolean; highlight?: boolean }) {
  const { club } = props
  return (
    <span
      className={`inline-flex min-w-0 items-center gap-2 ${props.highlight ? 'font-bold text-highlight' : ''}`}
    >
      <span
        aria-hidden
        className="inline-block h-3 w-3 shrink-0 rounded-full border"
        style={{ background: club.colors.primary, borderColor: club.colors.secondary }}
      />
      <span className="truncate">{props.short ? club.shortName : club.name}</span>
    </span>
  )
}
