import { ChevronsUpIcon, ChevronUpIcon } from 'lucide-react'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { IndividualFocus, Player, TrainingPlan } from '../../engine/model/types.ts'
import { focusGains, recommendedFocus } from '../../engine/progression/progression.ts'
import { INDIVIDUAL_FOCUS_NAMES } from '../format.ts'

const FOCUSES = Object.keys(INDIVIDUAL_FOCUS_NAMES) as IndividualFocus[]
/** The select's value for a player with no plan of his own. */
const NONE = 'nenhum'

/**
 * How much each plan helps his overall against the best one: 2 for most of
 * it, 1 for a fair part, 0 for little or nothing.
 */
function focusLevels(player: Player): Record<IndividualFocus, 0 | 1 | 2> {
  const gains = focusGains(player)
  const best = Math.max(...Object.values(gains))
  const level = (gain: number) =>
    best <= 0 ? 0 : gain >= 0.6 * best ? 2 : gain >= 0.3 * best ? 1 : 0
  return Object.fromEntries(FOCUSES.map((f) => [f, level(gains[f])])) as Record<
    IndividualFocus,
    0 | 1 | 2
  >
}

function Arrows({ level }: { level: 0 | 1 | 2 }) {
  if (level === 0) return null
  const Icon = level === 2 ? ChevronsUpIcon : ChevronUpIcon
  return <Icon className="size-3.5 text-green-600 dark:text-green-400" aria-hidden />
}

/**
 * A player's training plan, with arrows on the plans that raise his overall
 * the most for his position and attributes, and the best one marked.
 */
export function FocusSelect(props: {
  player: Player
  plan: TrainingPlan | undefined
  onChange: (plan: TrainingPlan | undefined) => void
  className?: string
}) {
  const { player, plan, onChange } = props
  const levels = focusLevels(player)
  const best = recommendedFocus(player)
  return (
    <Select
      value={plan?.focus ?? NONE}
      onValueChange={(v) =>
        onChange(
          v === NONE
            ? undefined
            : { focus: v as IndividualFocus, intensity: plan?.intensity ?? 'normal' },
        )
      }
    >
      <SelectTrigger
        size="sm"
        className={cn('w-28 sm:w-36', props.className)}
        aria-label={`Treino de ${player.name}`}
        onClick={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>Nenhum</SelectItem>
        {FOCUSES.map((focus) => (
          <SelectItem key={focus} value={focus}>
            {INDIVIDUAL_FOCUS_NAMES[focus]}
            <Arrows level={levels[focus]} />
            {focus === best && (
              <span className="text-xs text-muted-foreground in-data-[slot=select-trigger]:hidden">
                recomendado
              </span>
            )}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
