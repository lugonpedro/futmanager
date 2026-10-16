import { CircleHelpIcon } from 'lucide-react'
import { Link } from 'react-router'
import { cn } from '@/lib/utils'
import { learnPath, type LearnAnchor } from '../learn.ts'

/** "Como funciona?", opening the Aprenda page where it explains what this screen is about. */
export function LearnLink(props: LearnAnchor & { className?: string }) {
  const { className, ...anchor } = props
  return (
    <Link
      to={learnPath(anchor as LearnAnchor)}
      className={cn(
        'inline-flex shrink-0 items-center gap-1 text-xs text-muted-foreground underline-offset-2 hover:underline',
        className,
      )}
    >
      <CircleHelpIcon className="size-3.5" />
      Como funciona?
    </Link>
  )
}
