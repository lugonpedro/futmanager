/**
 * The screenshots of the Aprenda page, one per screen it talks about. Each
 * lives in public/aprenda/ as `<name>-celular.webp` and `<name>-computador.webp`,
 * taken by `npm run learn:shots`.
 */
export const LEARN_SHOTS = [
  'resumo',
  'calendario',
  'tabela',
  'copa',
  'diretoria',
  'tatica',
  'energia',
  'jogadores',
  'treino',
  'mercado',
  'financas',
] as const

export type LearnShot = (typeof LEARN_SHOTS)[number]

export const shotPath = (shot: LearnShot, device: 'celular' | 'computador') =>
  `/aprenda/${shot}-${device}.webp`
