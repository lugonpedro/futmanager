import type { League } from '../../../engine/model/types.ts'
import { divisionName } from '../../format.ts'

export function DivisionPicker(props: {
  leagues: readonly League[]
  value: string
  onChange: (leagueId: string) => void
}) {
  return (
    <div className="flex gap-1">
      {props.leagues.map((league) => (
        <button
          key={league.id}
          type="button"
          onClick={() => props.onChange(league.id)}
          className={`rounded px-3 py-1 text-sm ${league.id === props.value ? 'bg-green-600 font-semibold' : 'bg-green-800'}`}
        >
          {divisionName(league.division)}
        </button>
      ))}
    </div>
  )
}
