import { suggestedTeam, type TeamIdentity } from '../engine/room/team.ts'
import { useAccountStore } from '../store/account.ts'
import { MANAGER_CREST_COLORS } from './manager.ts'

/** The team suggested from the player's profile: their nickname and crest colours. */
export function useSuggestedTeam(): TeamIdentity {
  const profile = useAccountStore((s) => s.profile)
  const colors = MANAGER_CREST_COLORS[(profile?.crest ?? 0) % MANAGER_CREST_COLORS.length]
  return suggestedTeam(profile?.nickname ?? '', colors)
}
