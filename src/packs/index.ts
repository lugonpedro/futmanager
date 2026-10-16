import { parsePackFile } from '../engine/pack/file.ts'
import type { DataPack } from '../engine/pack/pack.ts'

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

const fromFile = (load: () => Promise<{ default: string }>, file: string) => async () =>
  parsePackFile((await load()).default, file).pack

export const BUILT_IN_PACKS: BuiltInPack[] = [
  {
    id: 'brasileirao-2026',
    name: 'Brasileirão 2026',
    description:
      'Os clubes das Séries A e B de 2026 e os jogadores dos elencos, com nome, idade e posição. A força de cada um continua gerada pelo jogo.',
    load: fromFile(() => import('./brasileirao-2026.json?raw'), 'brasileirao-2026.json'),
  },
]
