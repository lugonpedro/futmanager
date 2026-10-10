import type { Position, Posture, Trait } from '../engine/model/types.ts'

const millions = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 })
const thousands = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 })

/** R$ 12,5 mi / R$ 750 mil */
export function formatMoney(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `R$ ${millions.format(value / 1_000_000)} mi`
  return `R$ ${thousands.format(value / 1000)} mil`
}

export const divisionName = (division: number) => `Série ${String.fromCharCode(64 + division)}`

export const POSITION_NAMES: Record<Position, string> = {
  G: 'Goleiro',
  Z: 'Zagueiro',
  L: 'Lateral',
  M: 'Meio-campo',
  A: 'Atacante',
}

/** Display order on team sheets: from the goal outwards. */
export const POSITION_ORDER: Record<Position, number> = { G: 0, Z: 1, L: 2, M: 3, A: 4 }

export const TRAIT_NAMES: Record<Trait, string> = {
  reflexo: 'Reflexo',
  colocacao: 'Colocação',
  saida: 'Saída do gol',
  marcacao: 'Marcação',
  desarme: 'Desarme',
  cabeceio: 'Cabeceio',
  cruzamento: 'Cruzamento',
  velocidade: 'Velocidade',
  passe: 'Passe',
  armacao: 'Armação',
  drible: 'Drible',
  finalizacao: 'Finalização',
}

export const POSTURE_NAMES: Record<Posture, string> = {
  defensiva: 'Defensiva',
  normal: 'Normal',
  ofensiva: 'Ofensiva',
}
