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
  3: 'Dois returnos',
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
    `prazo de ${options.graceHours} h para o "Pronto"`,
    `lesões ${INJURY_LABELS[options.injuries].toLowerCase()}`,
    options.trades === 'desligadas'
      ? 'sem trocas'
      : `trocas ${TRADE_LABELS[options.trades].toLowerCase()}`,
  ]
}

const pad = (n: number) => String(n).padStart(2, '0')

/** A moment as a `datetime-local` input shows it, in the player's time zone. */
export function toLocalInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** The moment a `datetime-local` input holds, or undefined while it is incomplete. */
export function fromLocalInput(value: string): Date | undefined {
  const date = new Date(value)
  return value && !Number.isNaN(date.getTime()) ? date : undefined
}

/** Longest wait for the draft, as the database allows it. */
export const MAX_DRAFT_DAYS = 7

/** The draft time suggested for a new room: tomorrow at 21h. */
export function suggestedDraftAt(now: Date): Date {
  const date = new Date(now)
  date.setDate(date.getDate() + 1)
  date.setHours(21, 0, 0, 0)
  return date
}

/** Why the draft can't be at that time, if it can't: from now to a week after `from`. */
export function checkDraftAt(date: Date | undefined, now: Date, from = now): string | undefined {
  if (!date) return 'Escolha a data e a hora do draft.'
  if (date.getTime() < now.getTime()) return 'O draft precisa ser marcado para depois de agora.'
  if (date.getTime() > from.getTime() + MAX_DRAFT_DAYS * 24 * 3600 * 1000)
    return `O draft precisa ser marcado para daqui a no máximo ${MAX_DRAFT_DAYS} dias.`
  return undefined
}

const draftTime = new Intl.DateTimeFormat('pt-BR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  hour: '2-digit',
  minute: '2-digit',
})

/** When the draft is, like "quarta-feira, 21 de outubro às 21:00". */
export const formatDraftAt = (date: Date) => draftTime.format(date)

/** What the room form holds while the owner fills it in. */
export type RoomOptionsDraft = {
  name: string
  options: RoomOptions
  /** As the `datetime-local` input holds it. */
  draftAt: string
}

/** Why the room can't be saved as filled in, if it can't. */
export function checkRoomDraft(draft: RoomOptionsDraft, now: Date, from = now): string | undefined {
  const name = draft.name.trim()
  if (name.length < 3 || name.length > 40) return 'O nome da sala precisa ter de 3 a 40 letras.'
  return checkDraftAt(fromLocalInput(draft.draftAt), now, from)
}
