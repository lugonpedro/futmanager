import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FORMATION_LIST, MIDFIELD_LINES } from '../../engine/match/lineup.ts'
import type { Formation } from '../../engine/model/types.ts'

/** What the formations with a split midfield do differently from their plain count. */
const NOTES: Partial<Record<Formation, string>> = {
  '4-1-4-1': 'um volante protege a defesa',
  '4-2-3-1': 'três meias ajudam o ataque',
}

/** The formations in a dropdown: there are too many for a row of buttons. */
export function FormationSelect(props: {
  value: Formation
  onChange: (formation: Formation) => void
  disabled?: boolean
}) {
  return (
    <Select
      value={props.value}
      onValueChange={(value) => props.onChange(value as Formation)}
      disabled={props.disabled}
    >
      <SelectTrigger size="sm" className="min-w-28" aria-label="Formação">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {FORMATION_LIST.map((formation) => (
          <SelectItem key={formation} value={formation}>
            {formation}
            {MIDFIELD_LINES[formation] && (
              <span className="text-xs text-muted-foreground">{NOTES[formation]}</span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
