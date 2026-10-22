/**
 * The screenshots of the Aprenda page, one per screen it talks about. Each
 * lives in public/aprenda/ as `<name>-celular.webp` and `<name>-computador.webp`,
 * taken by `npm run learn:shots`.
 */
export const LEARN_SHOTS = [
  'calendario',
  'tabela',
  'diretoria',
  'tatica',
  'energia',
  'jogadores',
  'treino',
  'mercado',
  'financas',
] as const

/**
 * The shots of the Draft tab, taken by hand since the script only knows how
 * to play a career. Until a shot is `ready` the page shows a placeholder with
 * its `caption`; to add one, save both files under the same names in
 * public/aprenda/ and set `ready` to true.
 */
export const HAND_SHOTS = {
  sala: { ready: false, caption: 'Sala de espera, com os times e as regras da sala' },
  cartas: { ready: false, caption: 'Draft: a formação com as vagas e as 5 cartas abertas' },
  prime: { ready: false, caption: 'Uma carta prime, roxa, entre as 5 cartas' },
  rodada: { ready: false, caption: 'Rodada ao vivo, com o botão Acelerar' },
  'mercado-sala': { ready: false, caption: 'Mercado da sala: uma troca no Comparar' },
} satisfies Record<string, { ready: boolean; caption: string }>

/** A shot the script takes. */
export type AutoShot = (typeof LEARN_SHOTS)[number]

export type LearnShot = AutoShot | keyof typeof HAND_SHOTS

export const shotPath = (shot: LearnShot, device: 'celular' | 'computador') =>
  `/aprenda/${shot}-${device}.webp`

/** What the page shows instead of a hand shot nobody took yet, if it isn't there. */
export const missingShot = (shot: LearnShot): string | undefined => {
  const hand = (HAND_SHOTS as Record<string, { ready: boolean; caption: string }>)[shot]
  return hand && !hand.ready ? hand.caption : undefined
}
