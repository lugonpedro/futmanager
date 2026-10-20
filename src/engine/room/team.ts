import { cleanShortName } from '../pack/pack.ts'
import type { RoomTeam } from './types.ts'

/** What each person picks for their team when joining a room. */
export type TeamIdentity = Pick<RoomTeam, 'name' | 'shortName' | 'colors'>

/** The same limits the database checks in `room_check_team`. */
export const TEAM_LIMITS = { name: { min: 3, max: 24 }, shortName: { min: 2, max: 4 } } as const

const COLOR = /^#[0-9a-f]{6}$/

/** Why the room won't take this team, if it won't. */
export function checkTeamIdentity(team: TeamIdentity): string | undefined {
  const name = team.name.trim()
  if (name.length < TEAM_LIMITS.name.min || name.length > TEAM_LIMITS.name.max)
    return `O nome do time precisa ter de ${TEAM_LIMITS.name.min} a ${TEAM_LIMITS.name.max} letras.`
  if (!/^[A-Z0-9]{2,4}$/.test(team.shortName))
    return `A sigla precisa ter de ${TEAM_LIMITS.shortName.min} a ${TEAM_LIMITS.shortName.max} letras ou números.`
  if (!COLOR.test(team.colors.primary) || !COLOR.test(team.colors.secondary))
    return 'Escolha as duas cores do time.'
  return undefined
}

/**
 * The team suggested to someone joining: named after them, with a short name
 * from their nickname and the colours given (their profile crest's).
 */
export function suggestedTeam(nickname: string, colors: RoomTeam['colors']): TeamIdentity {
  const clean = nickname.trim()
  const name = clean.length >= 2 ? `Time de ${clean}` : 'Meu time'
  const letters = cleanShortName(clean).slice(0, 3)
  return {
    name: name.slice(0, TEAM_LIMITS.name.max).trim(),
    shortName: letters.length >= 2 ? letters : 'MEU',
    colors,
  }
}
