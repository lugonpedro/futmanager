import type { TeamIdentity } from '../engine/room/team.ts'
import type { RoomOptions, SquadShape } from '../engine/room/types.ts'
import { supabase } from './client.ts'

/** Where a room is: waiting for the draft, drafting, playing its league, or over. */
export type RoomStatus = 'espera' | 'draft' | 'liga' | 'encerrada'

/** A room the player is in, as its members see it. */
export type Room = {
  id: number
  name: string
  ownerId: string
  pack: string
  status: RoomStatus
  inviteCode: string
  options: RoomOptions
  createdAt: Date
  members: number
  /** Set once the draft starts. */
  draft?: {
    /** Places in the order of the first round. */
    order: number[]
    shape: SquadShape
    /** Picks made, which is also the number of the next one. */
    pickNo: number
    /** When the clock of the pick under way runs out; none once the draft is over. */
    deadline?: Date
  }
  /** Set while the league is on: the round people are setting their teams for. */
  round?: { no: number; openedAt: Date }
  /** The room "Revanche" opened, once someone pressed it. */
  rematchId?: number
}

/** A person in a room, with their team. */
export type RoomMember = TeamIdentity & {
  userId: string
  nickname?: string
  /** Marked "Pronto" in the waiting room. */
  ready: boolean
}

/** What the invite page shows before joining. */
export type RoomInvite = {
  roomId: number
  name: string
  ownerNickname?: string
  members: number
  teams: number
  status: RoomStatus
  joined: boolean
}

/** The message for creating a room without a running pass. */
export const PASS_NEEDED = 'Para criar uma sala você precisa do passe de 30 dias.'

/** Messages for the rules the database enforces, by the hint it raises them with. */
const MESSAGES: Record<string, string> = {
  conta: 'Entre na sua conta primeiro.',
  nome: 'O nome da sala precisa ter de 3 a 40 letras.',
  time: 'O nome do time precisa ter de 3 a 24 letras.',
  sigla: 'A sigla precisa ter de 2 a 4 letras ou números.',
  cores: 'Escolha as duas cores do time.',
  data: 'O draft precisa ser marcado para daqui a no máximo 7 dias.',
  opcoes: 'Alguma opção da sala não vale. Confira e tente de novo.',
  limite: 'Você já está em 10 salas em andamento.',
  convite: 'Esse convite não existe. Confira o código.',
  cheia: 'Essa sala já está cheia.',
  comecou: 'O draft dessa sala já começou.',
  repetido: 'Já tem um time com esse nome ou essa sigla na sala.',
  membro: 'Você não está nessa sala.',
  dono: 'Só quem criou a sala pode fazer isso.',
  'dono-sai': 'Quem criou a sala não sai dela: apague a sala.',
  poucos: 'A sala já tem mais pessoas do que esse número de times.',
  'sem-draft': 'O draft não está acontecendo agora.',
  vez: 'Ainda não é a sua vez.',
  jogador: 'Esse jogador não está na lista do draft.',
  escolhido: 'Esse jogador já foi escolhido.',
  goleiros: 'Faltam goleiros: o elenco precisa de 2.',
  liga: 'A liga não está em andamento.',
  escalacao: 'Essa escalação não vale. Confira e tente de novo.',
  'nao-acabou': 'A liga ainda não acabou.',
  livre: 'Esse jogador não está livre.',
  elenco: 'Algum jogador não está no elenco certo.',
  pedidos: 'Você já tem 10 pedidos. Tire algum antes.',
  trocas: 'As trocas estão fechadas nesta sala.',
  parceiro: 'Só dá para trocar com outra pessoa da sala.',
  troca: 'Escolha de 1 a 3 jogadores de cada lado, o mesmo número dos dois.',
  propostas: 'Você já tem 5 propostas esperando resposta.',
  proposta: 'Essa proposta já foi respondida.',
  passe: PASS_NEEDED,
  formacao: 'Essa formação não existe.',
  'formacao-fixa': 'A formação não muda depois da primeira carta.',
  'ja-abriu': 'As cartas desta escolha já foram abertas.',
  vaga: 'Essa vaga já está preenchida.',
  carta: 'Escolha uma das cartas abertas.',
}

/** The player's message for a failed call; anything unexpected gets a generic one. */
export function roomError(error: { hint?: string | null }): Error {
  return new Error(
    MESSAGES[error.hint ?? ''] ?? 'Não deu para falar com o servidor agora. Tente de novo.',
  )
}

function client() {
  if (!supabase) throw new Error('O jogo online não está disponível nesta versão.')
  return supabase
}

export type RoomRow = {
  id: number
  name: string
  owner_id: string
  pack: string
  status: RoomStatus
  invite_code: string
  teams: number
  squad_size: number
  draft_order: string
  pick_seconds: number
  auto_reserves: boolean
  legs: number
  injuries: string
  trades: string
  created_at: string
  pick_order: number[] | null
  squad_shape: SquadShape | null
  pick_no: number
  pick_deadline: string | null
  round_no: number | null
  round_opened_at: string | null
  rematch_id: number | null
  room_members: { count: number }[]
}

const ROOM_COLUMNS =
  'id, name, owner_id, pack, status, invite_code, teams, squad_size, draft_order, pick_seconds, auto_reserves, legs, injuries, trades, created_at, pick_order, squad_shape, pick_no, pick_deadline, round_no, round_opened_at, rematch_id, room_members(count)'

/** A room as the database keeps it, turned into the app's shape. */
export function toRoom(row: RoomRow): Room {
  return {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    pack: row.pack,
    status: row.status,
    inviteCode: row.invite_code,
    options: {
      teams: row.teams,
      squadSize: row.squad_size as RoomOptions['squadSize'],
      draftOrder: row.draft_order as RoomOptions['draftOrder'],
      pickSeconds: row.pick_seconds as RoomOptions['pickSeconds'],
      autoReserves: row.auto_reserves,
      legs: row.legs as RoomOptions['legs'],
      injuries: row.injuries as RoomOptions['injuries'],
      trades: row.trades as RoomOptions['trades'],
    },
    createdAt: new Date(row.created_at),
    members: row.room_members[0]?.count ?? 0,
    draft:
      row.pick_order && row.squad_shape
        ? {
            order: row.pick_order,
            shape: row.squad_shape,
            pickNo: row.pick_no,
            deadline: row.pick_deadline ? new Date(row.pick_deadline) : undefined,
          }
        : undefined,
    round:
      row.round_no !== null && row.round_opened_at
        ? { no: row.round_no, openedAt: new Date(row.round_opened_at) }
        : undefined,
    rematchId: row.rematch_id ?? undefined,
  }
}

/** The arguments the database functions take for a team. */
const teamArgs = (team: TeamIdentity) => ({
  team_name: team.name.trim(),
  short_name: team.shortName,
  color_primary: team.colors.primary,
  color_secondary: team.colors.secondary,
})

/** The rooms the player is in, the ones still going first, then the newest first. */
export async function loadMyRooms(): Promise<Room[]> {
  const { data, error } = await client()
    .from('rooms')
    .select(ROOM_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw roomError(error)
  const rooms = (data as RoomRow[]).map(toRoom)
  const over = (room: Room) => (room.status === 'encerrada' ? 1 : 0)
  return rooms.sort((a, b) => over(a) - over(b))
}

/** A room the player is in, with its people; undefined if it is gone or theirs no more. */
export async function loadRoom(
  id: number,
): Promise<{ room: Room; members: RoomMember[] } | undefined> {
  const db = client()
  const { data, error } = await db.from('rooms').select(ROOM_COLUMNS).eq('id', id).maybeSingle()
  if (error) throw roomError(error)
  if (!data) return undefined
  const rows = await db.rpc('room_lobby', { room: id })
  if (rows.error) throw roomError(rows.error)
  return {
    room: toRoom(data as RoomRow),
    members: (
      rows.data as {
        user_id: string
        nickname: string | null
        team_name: string
        short_name: string
        color_primary: string
        color_secondary: string
        ready: boolean | null
      }[]
    ).map((r) => ({
      userId: r.user_id,
      nickname: r.nickname ?? undefined,
      name: r.team_name,
      shortName: r.short_name,
      colors: { primary: r.color_primary, secondary: r.color_secondary },
      ready: r.ready === true,
    })),
  }
}

/** Creates a room with the player's team in it; returns its id. */
export async function createRoom(
  name: string,
  options: RoomOptions,
  team: TeamIdentity,
): Promise<number> {
  const { data, error } = await client().rpc('create_room', {
    room_name: name,
    options,
    draft_at: null,
    ...teamArgs(team),
  })
  if (error) throw roomError(error)
  return (data as { room_id: number }[])[0].room_id
}

/** Changes a waiting room's name and options; only its owner can. */
export async function updateRoom(id: number, name: string, options: RoomOptions): Promise<void> {
  const { error } = await client().rpc('update_room', {
    room: id,
    room_name: name,
    options,
    draft_at: null,
  })
  if (error) throw roomError(error)
}

/** The room behind an invite code, or undefined if there is none. */
export async function loadInvite(code: string): Promise<RoomInvite | undefined> {
  const { data, error } = await client().rpc('room_invite', { code })
  if (error) throw roomError(error)
  const row = (
    data as {
      room_id: number
      name: string
      owner_nickname: string | null
      members: number
      teams: number
      status: RoomStatus
      joined: boolean
    }[]
  )[0]
  return (
    row && {
      roomId: row.room_id,
      name: row.name,
      ownerNickname: row.owner_nickname ?? undefined,
      members: Number(row.members),
      teams: row.teams,
      status: row.status,
      joined: row.joined,
    }
  )
}

/** Joins the room with that invite code, with the player's team; returns its id. */
export async function joinRoom(code: string, team: TeamIdentity): Promise<number> {
  const { data, error } = await client().rpc('join_room', { code, ...teamArgs(team) })
  if (error) throw roomError(error)
  return data as number
}

/** Changes the player's team in a waiting room. */
export async function saveRoomTeam(id: number, team: TeamIdentity): Promise<void> {
  const { error } = await client().rpc('save_room_team', { room: id, ...teamArgs(team) })
  if (error) throw roomError(error)
}

/** Takes someone out of a waiting room: the player, or anyone if the owner asks. */
export async function leaveRoom(id: number, userId: string): Promise<void> {
  const { error } = await client().rpc('leave_room', { room: id, member: userId })
  if (error) throw roomError(error)
}

/** Deletes a room the player created, for everyone; only before the draft or after the end. */
export async function deleteRoom(id: number): Promise<void> {
  const { error } = await client().from('rooms').delete().eq('id', id)
  if (error) throw roomError(error)
}

/** The player's "Pronto" in a waiting room; true when that made the full room ready. */
export async function setWaitingReady(room: number, on: boolean): Promise<boolean> {
  const { data, error } = await client().rpc('room_wait_ready', { room, on_ready: on })
  if (error) throw roomError(error)
  return data === true
}
