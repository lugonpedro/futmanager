// What the room's push notices say. The database decides when each is due
// (see 20261031000000_avisos_sala.sql); room-notify sends them and the
// service worker shows them.

/** What the service worker shows: the text and the page a tap opens. */
export type Notice = { title: string; body: string; url: string; tag: string }

export type RoomNoticeKind = 'breve' | 'comecou' | 'vez' | 'falta' | 'rodada' | 'troca'

/** Which of a browser's choices covers each kind: trade offers are the market's. */
export const NOTICE_PREF: Record<RoomNoticeKind, 'rounds' | 'market'> = {
  breve: 'rounds',
  comecou: 'rounds',
  vez: 'rounds',
  falta: 'rounds',
  rodada: 'rounds',
  troca: 'market',
}

export type NoticeRoom = { id: number; name: string; pickSeconds: number }

export const isNoticeKind = (kind: unknown): kind is RoomNoticeKind =>
  typeof kind === 'string' && Object.hasOwn(NOTICE_PREF, kind)

/** The notice of this kind for the room, with what the database sent along. */
export function roomNotice(
  kind: RoomNoticeKind,
  room: NoticeRoom,
  data: { round?: number; over?: boolean; from?: string },
): Notice {
  const url = `/sala/${room.id}`
  const tag = `sala-${room.id}-${kind}`
  switch (kind) {
    case 'breve':
      return {
        title: 'O draft vai começar',
        body: `O draft da sala ${room.name} começa em menos de 15 minutos.`,
        url,
        tag,
      }
    case 'comecou':
      return {
        title: 'O draft começou',
        body: `Entre na sala ${room.name} para escolher na sua vez.`,
        url,
        tag,
      }
    case 'vez':
      return {
        title: 'Sua vez no draft',
        body: `${room.name}: é a sua vez de escolher. Você tem ${room.pickSeconds} segundos.`,
        url,
        tag,
      }
    case 'falta':
      return {
        title: 'Só falta você',
        body: `${room.name}: todos já marcaram "Pronto" para a rodada ${data.round}.`,
        url,
        tag,
      }
    case 'rodada':
      return data.over
        ? {
            title: 'A liga acabou',
            body: `${room.name}: veja quem foi o campeão.`,
            url,
            tag,
          }
        : {
            title: `Rodada ${data.round} jogada`,
            body: `${room.name}: veja os resultados e escale o time para a próxima.`,
            url,
            tag,
          }
    case 'troca':
      return {
        title: 'Proposta de troca',
        body: `${data.from ?? 'Um amigo'} quer trocar jogadores com você na sala ${room.name}.`,
        url,
        tag,
      }
  }
}
