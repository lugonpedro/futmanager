import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** A row of mutually exclusive options, like formations or match speeds. */
export function Choices<T extends string>(props: {
  options: readonly T[]
  value: T | undefined
  onChange: (value: T) => void
  label?: (value: T) => string
  title?: (value: T) => string
  disabled?: boolean
  ariaLabel?: string
}) {
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      aria-label={props.ariaLabel}
      disabled={props.disabled}
      value={props.value ?? ''}
      onValueChange={(value) => value && props.onChange(value as T)}
    >
      {props.options.map((option) => (
        <ToggleGroupItem
          key={option}
          value={option}
          title={props.title?.(option)}
          className="px-2.5"
        >
          {props.label ? props.label(option) : option}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
