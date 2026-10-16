import type { ReactNode } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import type { OfficialClub } from '../../engine/fantasy/official.ts'
import { Crest } from './ClubCrest.tsx'

/** A card with a single line of text, for loading and empty states. */
export function Note(props: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="text-sm text-muted-foreground">{props.children}</CardContent>
    </Card>
  )
}

/** The crest of an official club, drawn from its colors and short name. */
export function ClubMark(props: {
  clubId: string
  clubs: Record<string, OfficialClub>
  className?: string
}) {
  const club = props.clubs[props.clubId]
  if (!club) return null
  return (
    <Crest
      id={`crest-${props.clubId}`}
      colors={club.colors}
      letters={club.shortName}
      label={`Escudo do ${club.name}`}
      className={props.className ?? 'size-6 shrink-0'}
    />
  )
}
