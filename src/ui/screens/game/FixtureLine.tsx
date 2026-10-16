import type { Fixture, World } from '../../../engine/model/types.ts'
import { ClubName } from '../../components/ClubName.tsx'

/**
 * "Home 2 x 1 Away", "Home 1 x 1 Away (4-3 pên.)" after a shootout, or "Home x Away" before it is played.
 * `places` puts a label by each club's name, such as its place in the table.
 */
export function FixtureLine(props: {
  fixture: Fixture
  world: World
  userClubId: string
  places?: Record<string, string>
}) {
  const { fixture, world, userClubId, places } = props
  const place = (clubId: string) =>
    places?.[clubId] && (
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{places[clubId]}</span>
    )
  const { result } = fixture
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
      <span className="flex min-w-0 items-center justify-end gap-1.5 text-right">
        {place(fixture.homeId)}
        <ClubName club={world.clubs[fixture.homeId]} highlight={fixture.homeId === userClubId} />
      </span>
      <span className="rounded bg-muted px-2 font-semibold text-center whitespace-nowrap tabular-nums">
        {result ? `${result.homeGoals} x ${result.awayGoals}` : 'x'}
        {result?.penalties && (
          <span className="ml-1 text-xs font-normal text-muted-foreground">
            ({result.penalties.home}-{result.penalties.away} pên.)
          </span>
        )}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <ClubName club={world.clubs[fixture.awayId]} highlight={fixture.awayId === userClubId} />
        {place(fixture.awayId)}
      </span>
    </div>
  )
}
