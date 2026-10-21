/**
 * The built-in packs rate players on a scale like EA FC's, where nearly
 * everyone sits between 50 and 90, because that is the scale people know and
 * compare with. The game spreads players much wider, so each rating becomes an
 * overall with one fixed line: the average Série A player (about 70.5) lands on
 * a generated Série A's 67, the average Série B player (about 59) on its 44, and
 * a point of rating is worth two of overall. A player's overall depends on his
 * rating alone, so changing one name in the file moves no one else.
 */
export const overallFromRating = (rating: number) =>
  Math.min(99, Math.max(1, Math.round(2 * rating - 74)))

type RatedPlayer = { nota?: unknown; overall?: unknown }

/**
 * A built-in pack file with every `nota` turned into the `overall` the pack
 * format reads. A player that already has an overall keeps it.
 */
export function withOveralls<T>(file: T): T {
  const data = file as { clubes?: { jogadores?: RatedPlayer[] }[] }
  return {
    ...data,
    clubes: data.clubes?.map((club) => ({
      ...club,
      jogadores: club.jogadores?.map(({ nota, ...player }) =>
        player.overall === undefined && typeof nota === 'number'
          ? { ...player, overall: overallFromRating(nota) }
          : player,
      ),
    })),
  } as T
}
