import { parsePackFile } from '../engine/pack/file.ts'
import type { DataPack } from '../engine/pack/pack.ts'
import { PACK_LINES, type RatingLine, withOveralls } from './ratings.ts'

/**
 * Packs that come with the game, kept apart from the engine so a name can be
 * corrected or taken out without touching anything else. Each one is loaded
 * only when chosen.
 */
export type BuiltInPack = {
  id: string
  name: string
  description: string
  load: () => Promise<DataPack>
}

/** A pack file whose players carry a rating on the EA FC-like scale (`nota`). */
const fromRatedFile =
  (load: () => Promise<{ default: string }>, file: string, line: RatingLine) => async () =>
    parsePackFile(JSON.stringify(withOveralls(JSON.parse((await load()).default), line)), file).pack

export const BUILT_IN_PACKS: BuiltInPack[] = [
  {
    id: 'brasileirao-2026',
    name: 'Brasileirão 2026',
    description:
      'Os clubes das Séries A e B de 2026 e os jogadores dos elencos, com nome, idade, posição e força baseada nas notas do início de 2026.',
    load: fromRatedFile(
      () => import('./brasileirao-2026.json?raw'),
      'brasileirao-2026.json',
      PACK_LINES['brasileirao-2026'],
    ),
  },
  {
    id: 'champions-2026',
    name: 'Champions League 2026/27',
    description:
      'Os 36 clubes da fase de liga e os 4 mais fortes eliminados nos play-offs, com os elencos e a força tirados do FotMob em outubro de 2026. Os 20 mais fortes ficam na primeira divisão.',
    load: fromRatedFile(
      () => import('./champions-2026.json?raw'),
      'champions-2026.json',
      PACK_LINES['champions-2026'],
    ),
  },
]
