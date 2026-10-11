import type { GameState } from '../engine/model/types.ts'

export const CUP_SLUG = 'copa'

/** "serie-a" for the first division, "serie-b" for the second. */
export const divisionSlug = (division: number) => `serie-${String.fromCharCode(96 + division)}`

/** Where the user's own division opens, for links from other screens. */
export function competitionsPath(game: GameState, tab = 'classificacao') {
  return `/jogo/competicoes/${divisionSlug(game.world.clubs[game.userClubId].division)}/${tab}`
}
