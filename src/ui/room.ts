import type { RoomStatus } from '../cloud/rooms.ts'
import type { DraftOrder, InjuryRule, RoomOptions, TradeRule } from '../engine/room/types.ts'

/** The page a friend opens to join the room. */
export const roomInviteLink = (origin: string, code: string) => `${origin}/sala/convite/${code}`

/** An invite code as typed or pasted: the code itself, or a whole invite link. */
export function readRoomInviteCode(text: string): string {
  const trimmed = text.trim()
  const fromLink = trimmed.match(/\/convite\/([A-Za-z0-9]+)/)
  return (fromLink ? fromLink[1] : trimmed).toUpperCase()
}

export const STATUS_LABELS: Record<RoomStatus, string> = {
  espera: 'Sala de espera',
  draft: 'Draft',
  liga: 'Liga',
  encerrada: 'Encerrada',
}

export const DRAFT_ORDER_LABELS: Record<DraftOrder, string> = {
  serpentina: 'Serpentina',
  'terceira-invertida': 'Invertida na 3ª volta',
}

/** How each draft order works, under the choice. */
export const DRAFT_ORDER_HINTS: Record<DraftOrder, string> = {
  serpentina:
    'A ordem vai e volta: 1º ao 8º na primeira volta, 8º ao 1º na segunda, e assim por diante. Quem escolhe primeiro pega o melhor jogador e ainda abre a terceira volta, então sai com uma pequena vantagem.',
  'terceira-invertida':
    'Igual à serpentina, mas a 3ª volta repete a ordem da 2ª (8º ao 1º de novo). Quem pegou o melhor jogador fica por último duas voltas seguidas, e os elencos terminam com força parecida, seja qual for a sua posição na ordem.',
}

export const LEGS_LABELS: Record<RoomOptions['legs'], string> = {
  1: 'Só ida',
  2: 'Ida e volta',
  3: 'Três turnos',
  4: 'Quatro turnos',
}

export const INJURY_LABELS: Record<InjuryRule, string> = {
  normais: 'Normais',
  curtas: 'Curtas',
  desligadas: 'Desligadas',
}

export const TRADE_LABELS: Record<TradeRule, string> = {
  'ate-dois-tercos': 'Até 2/3 da liga',
  temporada: 'A liga toda',
  desligadas: 'Desligadas',
}

/** The room's options in a few words each, for the summary in the waiting room. */
export function describeOptions(options: RoomOptions): string[] {
  return [
    `${options.teams} times`,
    `elenco de ${options.squadSize}`,
    `ordem ${DRAFT_ORDER_LABELS[options.draftOrder].toLowerCase()}`,
    `${options.pickSeconds} s por escolha`,
    options.autoReserves ? 'reservas no automático' : 'todas as escolhas na mão',
    LEGS_LABELS[options.legs].toLowerCase(),
    `lesões ${INJURY_LABELS[options.injuries].toLowerCase()}`,
    options.trades === 'desligadas'
      ? 'sem trocas'
      : `trocas ${TRADE_LABELS[options.trades].toLowerCase()}`,
  ]
}

/** What the room form holds while the owner fills it in. */
export type RoomOptionsDraft = {
  name: string
  options: RoomOptions
}

/** Why the room can't be saved as filled in, if it can't. */
export function checkRoomDraft(draft: RoomOptionsDraft): string | undefined {
  const name = draft.name.trim()
  if (name.length < 3 || name.length > 40) return 'O nome da sala precisa ter de 3 a 40 letras.'
  return undefined
}
