import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { League } from '../../../engine/model/types.ts'
import { divisionName } from '../../format.ts'

export function DivisionPicker(props: {
  leagues: readonly League[]
  value: string
  onChange: (leagueId: string) => void
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      value={props.value}
      onValueChange={(value) => value && props.onChange(value)}
    >
      {props.leagues.map((league) => (
        <ToggleGroupItem key={league.id} value={league.id} className="px-3">
          {divisionName(league.division)}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
