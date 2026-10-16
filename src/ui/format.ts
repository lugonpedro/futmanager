import type {
  Attribute,
  Foot,
  GameState,
  IndividualFocus,
  LedgerCategory,
  Player,
  PlayStyle,
  Position,
  Posture,
  RoundStar,
  SponsorDeal,
  SponsorGoal,
  SponsorSlot,
  SquadFocus,
  TacticalRole,
  TrainingIntensity,
} from '../engine/model/types.ts'
import { CUP_NAME } from '../engine/season/cup.ts'
import { PROMOTION_SPOTS } from '../engine/season/rules.ts'
import type { AnyFace } from '../engine/player/attributes.ts'
import { formatDate } from '../engine/season/calendar.ts'

export { formatMoney, formatReais } from '../engine/money.ts'
export {
  formatDate,
  formatDayDate,
  formatDayMonth,
  formatShortDate,
  MONTH_NAMES,
  WEEKDAY_NAMES,
} from '../engine/season/calendar.ts'

export const divisionName = (division: number) => `Série ${String.fromCharCode(64 + division)}`

export const POSITION_NAMES: Record<Position, string> = {
  G: 'Goleiro',
  Z: 'Zagueiro',
  L: 'Lateral',
  M: 'Meio-campo',
  A: 'Atacante',
}

/** What each tactical role is called; its key is the abbreviation the pitch shows. */
export const TACTICAL_ROLE_NAMES: Record<TacticalRole, string> = {
  GOL: 'Goleiro',
  ZAG: 'Zagueiro',
  LAT: 'Lateral',
  ALA: 'Ala',
  VOL: 'Volante',
  MC: 'Meio-campista',
  MEI: 'Meia ofensivo',
  ME: 'Meia pela esquerda',
  MD: 'Meia pela direita',
  PE: 'Ponta esquerda',
  PD: 'Ponta direita',
  CA: 'Centroavante',
  SA: 'Segundo atacante',
}

/** Display order on team sheets: from the goal outwards. */
export const POSITION_ORDER: Record<Position, number> = { G: 0, Z: 1, L: 2, M: 3, A: 4 }

export const STYLE_NAMES: Record<PlayStyle, string> = {
  paredao: 'Paredão',
  colocacao: 'Bem colocado',
  saida: 'Goleiro-líbero',
  muralha: 'Muralha',
  desarmador: 'Desarmador',
  cabeceador: 'Cabeceador',
  cruzador: 'Cruzador',
  velocista: 'Velocista',
  passador: 'Passe preciso',
  armador: 'Armador',
  driblador: 'Driblador',
  finalizador: 'Finalizador',
}

/** "Finalizador+" for the "+" version. */
export const styleName = (style: PlayStyle, level: number) =>
  `${STYLE_NAMES[style]}${level === 2 ? '+' : ''}`

/** Card abbreviations and what they stand for. */
export const FACE_NAMES: Record<AnyFace, { short: string; name: string }> = {
  RIT: { short: 'RIT', name: 'Ritmo' },
  FIN: { short: 'FIN', name: 'Finalização' },
  PAS: { short: 'PAS', name: 'Passe' },
  DRI: { short: 'DRI', name: 'Drible' },
  DEF: { short: 'DEF', name: 'Defesa' },
  FIS: { short: 'FIS', name: 'Físico' },
  ELA: { short: 'ELA', name: 'Elasticidade' },
  MAO: { short: 'MÃO', name: 'Manejo' },
  REP: { short: 'REP', name: 'Reposição' },
  REF: { short: 'REF', name: 'Reflexo' },
  VEL: { short: 'VEL', name: 'Velocidade' },
  POS: { short: 'POS', name: 'Posicionamento' },
}

export const ATTRIBUTE_NAMES: Record<Attribute, string> = {
  acceleration: 'Aceleração',
  sprintSpeed: 'Velocidade',
  finishing: 'Finalização',
  shotPower: 'Força do chute',
  attackPositioning: 'Posicionamento ofensivo',
  penalties: 'Pênalti',
  shortPassing: 'Passe curto',
  longPassing: 'Passe longo',
  vision: 'Visão',
  crossing: 'Cruzamento',
  dribbling: 'Drible',
  ballControl: 'Controle de bola',
  agility: 'Agilidade',
  marking: 'Marcação',
  tackling: 'Desarme',
  interceptions: 'Interceptação',
  heading: 'Cabeceio',
  strength: 'Força',
  stamina: 'Resistência',
  jumping: 'Impulsão',
  aggression: 'Agressividade',
  diving: 'Elasticidade',
  handling: 'Manejo',
  kicking: 'Reposição',
  reflexes: 'Reflexo',
  keeperPositioning: 'Posicionamento',
}

export const FOOT_NAMES: Record<Foot, string> = { direito: 'Direito', esquerdo: 'Esquerdo' }

/** Card colour: by overall band, or a special card for the round's best XI and the player of the season. */
export type CardTier = 'bronze' | 'prata' | 'ouro' | 'rodada' | 'craque'

export const CARD_TIER_NAMES: Record<CardTier, string> = {
  bronze: 'Bronze',
  prata: 'Prata',
  ouro: 'Ouro',
  rodada: 'Seleção da rodada',
  craque: 'Craque da temporada',
}

/**
 * Bands set by our own spread of overalls, not FC's numbers: about two in
 * five players are bronze, a bit less are silver, the top fifth gold.
 */
export const CARD_CUTS = { prata: 50, ouro: 70 }

/** Player of the season in any division last season. */
/** What put a player in the round's best XI: "nota 8.7, 2 gols", or just "2 gols". */
export function roundStarFeats(star: RoundStar, withRating = true): string {
  const feats = withRating ? [`nota ${star.rating.toFixed(1)}`] : []
  if (star.goals > 0) feats.push(`${star.goals} ${star.goals === 1 ? 'gol' : 'gols'}`)
  if (star.saves > 0) feats.push(`${star.saves} ${star.saves === 1 ? 'defesa' : 'defesas'}`)
  return feats.join(', ')
}

export const isSeasonStar = (game: GameState, playerId: string) =>
  game.history.at(-1)?.leagues.some((l) => l.bestPlayer?.playerId === playerId) ?? false

export function cardTier(player: Player, game?: GameState): CardTier {
  if (game && isSeasonStar(game, player.id)) return 'craque'
  if (game?.season.roundStars.some((star) => star.playerId === player.id)) return 'rodada'
  return player.overall >= CARD_CUTS.ouro
    ? 'ouro'
    : player.overall >= CARD_CUTS.prata
      ? 'prata'
      : 'bronze'
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

/** Where a saved career is, like "12 de maio de 2027" or "2027, fim da temporada". */
export function slotProgress(slot: {
  year: number
  round: number
  today?: string
  seasonOver: boolean
}): string {
  if (slot.seasonOver) return `${slot.year}, fim da temporada`
  if (slot.today) return formatDate(slot.today)
  return `${slot.year}, rodada ${slot.round}`
}

const savedWhen = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

/** When a career was saved, like "12/10/2026, 16:40". */
export const formatSavedAt = (time: number) => savedWhen.format(new Date(time))

export const SPONSOR_STYLE_NAMES: Record<SponsorDeal['style'], string> = {
  segura: 'Segura',
  equilibrada: 'Equilibrada',
  ousada: 'Ousada',
}

/** Where a smaller sponsor goes on the kit, to follow "na"/"no": "manga", "calção". */
export const SPONSOR_SLOT_NAMES: Record<SponsorSlot, string> = {
  manga: 'manga',
  costas: 'costas',
  calcao: 'calção',
}

/** "na manga", "nas costas", "no calção". */
export const sponsorSlotPlace = (slot: SponsorSlot) =>
  `${slot === 'manga' ? 'na' : slot === 'costas' ? 'nas' : 'no'} ${SPONSOR_SLOT_NAMES[slot]}`

/** A sponsor's goal, to follow "se o time": "ficar no G-4", "for campeão da Série A". */
export function sponsorGoalText(goal: SponsorGoal, division: number): string {
  if (goal.kind === 'final-copa') return `chegar à final da ${CUP_NAME}`
  if (goal.position === 1) return `for campeão da ${divisionName(division)}`
  if (division > 1 && goal.position <= PROMOTION_SPOTS) return 'conquistar o acesso'
  if (goal.position === 4) return 'ficar no G-4'
  return `terminar entre os ${goal.position} primeiros`
}

/** "Só 2027" or "2027 a 2029". */
export const sponsorSeasons = (deal: Pick<SponsorDeal, 'firstSeason' | 'lastSeason'>) =>
  deal.firstSeason === deal.lastSeason
    ? `só ${deal.firstSeason}`
    : `${deal.firstSeason} a ${deal.lastSeason}`

export const SQUAD_FOCUS_NAMES: Record<SquadFocus, { name: string; detail: string }> = {
  equilibrado: { name: 'Equilibrado', detail: 'Um pouco de tudo, sem pressa em nada.' },
  fisico: {
    name: 'Físico',
    detail: 'Velocidade, força e fôlego crescem mais rápido, mas sobe a chance de lesão.',
  },
  tecnico: { name: 'Técnico', detail: 'Passe, drible e finalização crescem mais rápido.' },
  tatico: { name: 'Tático', detail: 'Posicionamento, visão e marcação crescem mais rápido.' },
  descanso: {
    name: 'Descanso',
    detail: 'O elenco recupera a condição mais rápido e se machuca menos, mas cresce mais devagar.',
  },
}

export const INDIVIDUAL_FOCUS_NAMES: Record<IndividualFocus, string> = {
  geral: 'Geral',
  finalizacao: 'Finalização',
  passe: 'Passe',
  drible: 'Drible',
  cruzamento: 'Cruzamento',
  defesa: 'Defesa',
  cabeceio: 'Cabeceio',
  velocidade: 'Velocidade',
  goleiro: 'Goleiro',
}

export const INTENSITY_NAMES: Record<TrainingIntensity, { name: string; detail: string }> = {
  leve: { name: 'Leve', detail: 'Cresce devagar e recupera a condição mais rápido.' },
  normal: { name: 'Normal', detail: 'O ritmo de sempre.' },
  intenso: { name: 'Intenso', detail: 'Cresce mais rápido, mas chega cansado aos jogos.' },
}

/** "55 a 65", or the one number once it is known. */
export const rangeText = (range: { low: number; high: number }) =>
  range.low === range.high ? String(range.low) : `${range.low} a ${range.high}`

/** "+2", "-1" or "0", for a change in overall. */
export const signedChange = (change: number) => (change > 0 ? `+${change}` : String(change))

/** One decimal place, as fantasy points and prices are shown: "12,5". */
export const tenths = new Intl.NumberFormat('pt-BR', {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
})
