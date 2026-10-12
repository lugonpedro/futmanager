import type { LedgerCategory, Player, Position, Posture, Trait } from '../engine/model/types.ts'

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

/** Green in his own position, yellow next to it, red anywhere else. */
export function fitLevel(fit: number): 'good' | 'fair' | 'poor' {
  return fit >= 1 ? 'good' : fit >= 0.85 ? 'fair' : 'poor'
}

/** Text colour for a player's fit, on the pitch (dark green) or on a page. */
export function fitClass(fit: number, onPitch = false): string {
  const level = fitLevel(fit)
  if (onPitch) {
    return level === 'good'
      ? 'text-green-300'
      : level === 'fair'
        ? 'text-yellow-300'
        : 'text-red-300'
  }
  return level === 'good'
    ? 'text-green-700 dark:text-green-400'
    : level === 'fair'
      ? 'text-amber-600 dark:text-yellow-300'
      : 'text-red-600 dark:text-red-400'
}

export type Role = 'titular' | 'reserva' | 'fora'

export const ROLE_NAMES: Record<Role, string> = {
  titular: 'Titular',
  reserva: 'Reserva',
  fora: 'Fora do jogo',
}

/** Came up through this club's academy. */
export const isHomegrown = (player: Player, clubId: string) =>
  player.id.startsWith('B') && player.id.split('-')[1] === clubId
