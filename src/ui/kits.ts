import type { Club } from '../engine/model/types.ts'

/** What a side wears in a match: the shirt, its trim and the keeper's shirt. */
export type Kit = { fill: string; line: string; keeper: string }

/** Two colours closer than this, in CIE Lab units, read as the same shirt. */
export const CLASH = 40

/** Third kits when both of the visitors' colours clash with the home shirt. */
const SPARE_KITS = ['#ffffff', '#111111', '#8a8f98']
/** Keeper shirts: bright colours no outfield kit is likely to share. */
const KEEPER_KITS = ['#facc15', '#a3e635', '#f97316', '#22d3ee']

function rgb(color: string): [number, number, number] {
  const hex = color.replace('#', '')
  const full =
    hex.length === 3
      ? hex
          .split('')
          .map((c) => c + c)
          .join('')
      : hex.slice(0, 6)
  const value = Number.parseInt(full, 16)
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255]
}

/** sRGB to CIE Lab (D65), the space where distance follows what the eye sees. */
function lab(color: string): [number, number, number] {
  const [r, g, b] = rgb(color).map((v) => {
    const c = v / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  })
  const x = (0.4124 * r + 0.3576 * g + 0.1805 * b) / 0.95047
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * b) / 1.08883
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116)
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))]
}

/** How different two colours look: 0 for the same, about 100 for black and white. */
export function colorDistance(a: string, b: string): number {
  const [p, q] = [lab(a), lab(b)]
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2])
}

/** The candidate furthest from the nearest of the colours to avoid. */
function mostDistinct(candidates: readonly string[], avoid: readonly string[]): string {
  const gap = (c: string) => Math.min(...avoid.map((a) => colorDistance(c, a)))
  return candidates.reduce((best, c) => (gap(c) > gap(best) ? c : best))
}

/**
 * The kits for a match. The home side wears its colours; the visitors wear
 * theirs unless they clash, then their second colour, then a white, black
 * or grey third kit, whichever stands out most. Each keeper gets a bright
 * shirt unlike both sides and unlike the other keeper.
 */
export function matchKits(home: Club, away: Club): { home: Kit; away: Kit } {
  const homeFill = home.colors.primary
  const clashes = (c: string) => colorDistance(c, homeFill) < CLASH
  const awayFill = !clashes(away.colors.primary)
    ? away.colors.primary
    : !clashes(away.colors.secondary)
      ? away.colors.secondary
      : mostDistinct(SPARE_KITS, [homeFill, home.colors.secondary])
  const awayLine = [away.colors.secondary, away.colors.primary, '#111111', '#ffffff'].find(
    (c) => colorDistance(c, awayFill) >= CLASH,
  )!
  const homeKeeper = mostDistinct(KEEPER_KITS, [homeFill, awayFill])
  const awayKeeper = mostDistinct(
    KEEPER_KITS.filter((c) => c !== homeKeeper),
    [homeFill, awayFill, homeKeeper],
  )
  return {
    home: { fill: homeFill, line: home.colors.secondary, keeper: homeKeeper },
    away: { fill: awayFill, line: awayLine, keeper: awayKeeper },
  }
}

/** Black or white, whichever reads better on the shirt. */
export function textOn(fill: string): string {
  return colorDistance(fill, '#ffffff') > colorDistance(fill, '#111111') ? '#ffffff' : '#111111'
}
