import type { Rng } from '../rng.ts'

/** Each template gets the player's name, plus the goalkeeper's for saves. */
type Template = (player: string, other?: string) => string

const GOAL: Record<'cabeca' | 'chute' | 'fora' | 'penalti' | 'jogada', readonly Template[]> = {
  cabeca: [
    (p) => `GOL! ${p} sobe mais que todo mundo e testa para o fundo da rede!`,
    (p) => `GOL! Cruzamento na área e ${p} cabeceia sem chance para o goleiro!`,
  ],
  chute: [
    (p) => `GOL! ${p} recebe na área e bate cruzado!`,
    (p) => `GOL! ${p} aproveita o rebote e empurra para as redes!`,
    (p) => `GOL! ${p} tira do goleiro e toca para o gol vazio!`,
  ],
  fora: [
    (p) => `GOL! Que pancada de ${p} de fora da área!`,
    (p) => `GOL! ${p} arrisca de longe e acerta o ângulo!`,
  ],
  penalti: [(p) => `GOL! Pênalti! ${p} bate firme e converte!`],
  jogada: [
    (p) => `GOL! Linda tabela e ${p} finaliza com categoria!`,
    (p) => `GOL! ${p} passa por dois marcadores e manda para a rede!`,
  ],
}

const SAVE: readonly Template[] = [
  (p, gk) => `${p} chuta forte e ${gk} faz grande defesa!`,
  (p, gk) => `${gk} se estica todo e espalma a finalização de ${p}!`,
  (p, gk) => `${p} cabeceia, mas ${gk} segura firme.`,
]

const MISS: readonly Template[] = [
  (p) => `${p} finaliza por cima do gol.`,
  (p) => `${p} bate cruzado e a bola passa raspando a trave!`,
  (p) => `${p} perde chance clara na cara do gol!`,
  (p) => `${p} arrisca de longe, para fora.`,
  (p) => `Na trave! ${p} quase marca!`,
]

const YELLOW: readonly Template[] = [
  (p) => `Cartão amarelo para ${p} por falta dura.`,
  (p) => `${p} reclama demais e leva o amarelo.`,
  (p) => `${p} para o contra-ataque com falta e recebe o amarelo.`,
]

const RED: readonly Template[] = [
  (p) => `Cartão vermelho direto! ${p} entra de sola e está expulso!`,
  (p) => `Expulso! ${p} perde a cabeça e recebe o vermelho!`,
]

const pick = (rng: Rng, templates: readonly Template[], player: string, other?: string) =>
  rng.pick(templates)(player, other)

export type GoalKind = keyof typeof GOAL

export const narrate = {
  goal: (rng: Rng, kind: GoalKind, player: string) => pick(rng, GOAL[kind], player),
  save: (rng: Rng, player: string, keeper: string) => pick(rng, SAVE, player, keeper),
  miss: (rng: Rng, player: string) => pick(rng, MISS, player),
  yellow: (rng: Rng, player: string) => pick(rng, YELLOW, player),
  red: (rng: Rng, player: string) => pick(rng, RED, player),
  secondYellow: (player: string) => `Segundo amarelo para ${player}! Expulso!`,
  injury: (player: string) => `${player} sente a lesão e não tem condições de seguir.`,
  substitution: (out: string, on: string) => `Substituição: sai ${out}, entra ${on}.`,
  kickoff: (home: string, away: string) => `Rola a bola para ${home} x ${away}!`,
  halftime: (home: string, homeGoals: number, awayGoals: number, away: string) =>
    `Fim do primeiro tempo: ${home} ${homeGoals} x ${awayGoals} ${away}.`,
  fulltime: (home: string, homeGoals: number, awayGoals: number, away: string) =>
    `Fim de jogo: ${home} ${homeGoals} x ${awayGoals} ${away}.`,
}
