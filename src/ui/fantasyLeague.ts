/**
 * Places in a table sorted best first, with equal totals sharing a place:
 * 30, 20, 20, 10 are 1st, 2nd, 2nd and 4th.
 */
export function places(totals: readonly number[]): number[] {
  const out: number[] = []
  totals.forEach((total, i) => out.push(i > 0 && total === totals[i - 1] ? out[i - 1] : i + 1))
  return out
}

/** The page a friend opens to join the league. */
export const inviteLink = (origin: string, code: string) => `${origin}/fantasia/convite/${code}`

/** An invite code as typed or pasted: the code itself, or a whole invite link. */
export function readInviteCode(text: string): string {
  const trimmed = text.trim()
  const fromLink = trimmed.match(/\/convite\/([A-Za-z0-9]+)/)
  return (fromLink ? fromLink[1] : trimmed).toUpperCase()
}
