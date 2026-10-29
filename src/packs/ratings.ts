/**
 * The built-in packs rate players on a scale like EA FC's, where nearly
 * everyone sits between 50 and 90, because that is the scale people know and
 * compare with. The game spreads players much wider, so each rating becomes an
 * overall with a fixed line per pack. A player's overall depends on his rating
 * alone, so changing one name in the file moves no one else.
 */
export type RatingLine = { slope: number; offset: number }
/**
 * The average Série A player (about 70.5) lands on a generated Série A's 67,
 * the average Série B player (about 59) on its 44, and a point of rating is
 * worth two of overall.
 */
export const BRASILEIRAO_LINE: RatingLine = { slope: 2, offset: -74 }
/**
 * The Champions League pack rates its first division about 80 and its second
 * about 72, where the Brasileirão has 70.5 and 59. A steeper line of its own
 * brings both near the generated divisions (63 and 44), with a wage bill like
 * the Brasileirão's, and still puts the best players of Europe (90) on 88.
 */
export const CHAMPIONS_LINE: RatingLine = { slope: 2.5, offset: -137 }

/** Each built-in pack's line, by its id, for the app and the room-draft function alike. */
export const PACK_LINES: Record<string, RatingLine> = {
  'brasileirao-2026': BRASILEIRAO_LINE,
  'champions-2026': CHAMPIONS_LINE,
}

export const overallFromRating = (rating: number, line = BRASILEIRAO_LINE) =>
  Math.min(99, Math.max(1, Math.round(line.slope * rating + line.offset)))

type RatedPlayer = { nota?: unknown; overall?: unknown }

/**
 * A built-in pack file with every `nota` turned into the `overall` the pack
 * format reads. A player that already has an overall keeps it.
 */
export function withOveralls<T>(file: T, line = BRASILEIRAO_LINE): T {
  const data = file as { clubes?: { jogadores?: RatedPlayer[] }[] }
  return {
    ...data,
    clubes: data.clubes?.map((club) => ({
      ...club,
      jogadores: club.jogadores?.map(({ nota, ...player }) =>
        player.overall === undefined && typeof nota === 'number'
          ? { ...player, overall: overallFromRating(nota, line) }
          : player,
      ),
    })),
  } as T
}
