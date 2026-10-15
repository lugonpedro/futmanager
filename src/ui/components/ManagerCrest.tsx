import { initials, MANAGER_CREST_COLORS } from '../manager.ts'
import { Crest } from './ClubCrest.tsx'

export function ManagerCrest(props: { crest: number; nickname: string; className?: string }) {
  const colors = MANAGER_CREST_COLORS[props.crest % MANAGER_CREST_COLORS.length]
  return (
    <Crest
      id={`manager-crest-${props.crest}`}
      colors={colors}
      letters={initials(props.nickname)}
      label={`Escudo de ${props.nickname}`}
      className={props.className}
    />
  )
}
