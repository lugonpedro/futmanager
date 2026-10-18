/** The query parameter that carries the page to go back to after signing in. */
export const RETURN_PARAM = 'volta'

/** The account page, set to send the player back to `path` once they sign in. */
export const signInLink = (path: string) => `/conta?${RETURN_PARAM}=${encodeURIComponent(path)}`

/**
 * The page to go back to after signing in, if it is one of the game's own:
 * a path on this site, never another address someone slipped into the link.
 */
export function readReturnTo(value: string | null): string | undefined {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.includes('\\'))
    return undefined
  return value.startsWith('/conta') ? undefined : value
}
