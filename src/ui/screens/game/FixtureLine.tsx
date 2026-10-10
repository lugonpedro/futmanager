import type { Fixture, World } from '../../../engine/model/types.ts'
import { ClubName } from '../../components/ClubName.tsx'

/** "Home 2 x 1 Away", or "Home x Away" before it is played. */
export function FixtureLine(props: { fixture: Fixture; world: World; userClubId: string }) {
  const { fixture, world, userClubId } = props
  const { result } = fixture
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-2 text-sm">
      <span className="flex min-w-0 justify-end text-right">
        <ClubName club={world.clubs[fixture.homeId]} highlight={fixture.homeId === userClubId} />
      </span>
      <span className="rounded bg-black/30 px-2 text-center whitespace-nowrap tabular-nums">
        {result ? `${result.homeGoals} x ${result.awayGoals}` : 'x'}
      </span>
      <span className="flex min-w-0">
        <ClubName club={world.clubs[fixture.awayId]} highlight={fixture.awayId === userClubId} />
      </span>
    </div>
  )
}
