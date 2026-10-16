import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { FORMATION_LIST } from '../../engine/match/lineup.ts'
import type { Formation } from '../../engine/model/types.ts'

/** What each formation is about, by the roles in it. */
const NOTES: Record<Formation, string> = {
  '4-4-2': 'equilibrado, com meias pelos lados',
  '4-3-3': 'volante atrás, dois pontas abertos',
  '3-5-2': 'três zagueiros, alas e um meia ofensivo',
  '4-5-1': 'meio cheio, um centroavante só',
  '5-3-2': 'cinco atrás, com volante',
  '3-4-3': 'três zagueiros, alas e pontas',
  '4-2-4': 'dois no meio, quatro na frente',
  '5-4-1': 'retranca: cinco atrás e um volante',
  '4-1-4-1': 'um volante protege a defesa',
  '4-2-3-1': 'dois volantes e um meia ofensivo',
}

/**
 * The formations in a dropdown: there are too many for a row of buttons.
 * `plain` leaves out the notes on roles, for the Fantasy, which has none.
 */
export function FormationSelect(props: {
  value: Formation
  onChange: (formation: Formation) => void
  disabled?: boolean
  plain?: boolean
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
            {!props.plain && (
              <span className="text-xs text-muted-foreground in-data-[slot=select-trigger]:hidden">
                {NOTES[formation]}
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
