/** The generic crests a manager can pick for the profile: colour pairs, never a real badge. */
export const MANAGER_CREST_COLORS = [
  { primary: '#1d7a41', secondary: '#f5f5f5' },
  { primary: '#1f3f8f', secondary: '#f2c230' },
  { primary: '#b3202a', secondary: '#111111' },
  { primary: '#111111', secondary: '#f5f5f5' },
  { primary: '#f5f5f5', secondary: '#1f3f8f' },
  { primary: '#6b2c91', secondary: '#f5f5f5' },
  { primary: '#e36414', secondary: '#1b1b1b' },
  { primary: '#0f8b8d', secondary: '#f2e8cf' },
  { primary: '#f2c230', secondary: '#1d7a41' },
  { primary: '#8a1c1c', secondary: '#e9d8a6' },
  { primary: '#4a4e69', secondary: '#9ad1d4' },
  { primary: '#d1495b', secondary: '#f5f5f5' },
]

/** Up to two initials of the nickname, like "JS" for "João Silva". */
export function initials(nickname: string) {
  const words = nickname.trim().split(/\s+/).filter(Boolean)
  const letters =
    words.length > 1 ? words[0][0] + words[words.length - 1][0] : (words[0] ?? '?').slice(0, 2)
  return letters.toUpperCase()
}
