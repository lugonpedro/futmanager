import { Input } from '@/components/ui/input'
import { formatMoney } from '../format.ts'

/** A whole-reais amount, with the short form (R$ 1,2 mi) shown under it. */
export function MoneyInput(props: {
  id: string
  value: number
  onChange: (value: number) => void
  step?: number
}) {
  return (
    <div className="flex flex-col gap-1">
      <Input
        id={props.id}
        type="number"
        inputMode="numeric"
        min={0}
        step={props.step ?? 10_000}
        value={Number.isFinite(props.value) ? props.value : ''}
        onChange={(e) => props.onChange(Math.max(0, Number(e.target.value)))}
      />
      <span className="text-xs text-muted-foreground">{formatMoney(props.value || 0)}</span>
    </div>
  )
}
