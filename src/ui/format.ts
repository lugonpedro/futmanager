import type { LedgerCategory, Position, Posture, Trait } from '../engine/model/types.ts'

export { formatMoney, formatReais } from '../engine/money.ts'

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

export const LEDGER_NAMES: Record<LedgerCategory, string> = {
  bilheteria: 'Bilheteria',
  patrocinio: 'Patrocínio',
  premiacao: 'Premiação',
  vendas: 'Venda de jogadores',
  salarios: 'Salários',
  compras: 'Compra de jogadores',
}
