import { supabase } from './client.ts'

/** A private league of the official season, as its members see it. */
export type FantasyLeague = {
  id: number
  seasonId: number
  name: string
  ownerId: string
  inviteCode: string
  members: number
}

/** A row of a league's standings, best first. */
export type Standing = {
  userId: string
  nickname?: string
  crest: number
  total: number
  /** Points in the last round played. */
  last: number
}

/** What the invite page shows before joining. */
export type LeagueInvite = {
  leagueId: number
  name: string
  ownerNickname?: string
  members: number
  joined: boolean
}

/** Messages for the rules the database enforces, by the hint it raises them with. */
const MESSAGES: Record<string, string> = {
  conta: 'Entre na sua conta primeiro.',
  nome: 'O nome da liga precisa ter de 3 a 40 letras.',
  temporada: 'A temporada oficial ainda não começou.',
  passe: 'Criar liga exige o passe da temporada.',
  limite: 'Você já criou 10 ligas nesta temporada.',
  convite: 'Esse convite não existe. Confira o código.',
  cheia: 'Essa liga já está cheia (100 pessoas).',
  membro: 'Você não está nessa liga.',
}

/** The player's message for a failed call; anything unexpected gets a generic one. */
export function leagueError(error: { hint?: string | null }): Error {
  return new Error(
    MESSAGES[error.hint ?? ''] ?? 'Não deu para falar com o servidor agora. Tente de novo.',
  )
}

function client() {
  if (!supabase) throw new Error('O jogo online não está disponível nesta versão.')
  return supabase
}

type LeagueRow = {
  id: number
  season_id: number
  name: string
  owner_id: string
  invite_code: string
  fantasy_league_members: { count: number }[]
}

const LEAGUE_COLUMNS = 'id, season_id, name, owner_id, invite_code, fantasy_league_members(count)'

const toLeague = (row: LeagueRow): FantasyLeague => ({
  id: row.id,
  seasonId: row.season_id,
  name: row.name,
  ownerId: row.owner_id,
  inviteCode: row.invite_code,
  members: row.fantasy_league_members[0]?.count ?? 0,
})

/** The leagues of the season the player is in, oldest first. */
export async function loadMyLeagues(seasonId: number): Promise<FantasyLeague[]> {
  const { data, error } = await client()
    .from('fantasy_leagues')
    .select(LEAGUE_COLUMNS)
    .eq('season_id', seasonId)
    .order('id')
  if (error) throw leagueError(error)
  return (data as LeagueRow[]).map(toLeague)
}

/** A league the player is in, with its standings; undefined if it is gone or theirs no more. */
export async function loadLeague(
  id: number,
): Promise<{ league: FantasyLeague; standings: Standing[] } | undefined> {
  const db = client()
  const { data, error } = await db
    .from('fantasy_leagues')
    .select(LEAGUE_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw leagueError(error)
  if (!data) return undefined
  const rows = await db.rpc('fantasy_league_standings', { league: id })
  if (rows.error) throw leagueError(rows.error)
  return {
    league: toLeague(data as LeagueRow),
    standings: (
      rows.data as {
        user_id: string
        nickname: string | null
        crest: number | null
        total: number
        last: number
      }[]
    ).map((r) => ({
      userId: r.user_id,
      nickname: r.nickname ?? undefined,
      crest: r.crest ?? 0,
      total: Number(r.total),
      last: Number(r.last),
    })),
  }
}

/** Creates a league in the running season; returns its id. */
export async function createLeague(name: string): Promise<number> {
  const { data, error } = await client().rpc('create_fantasy_league', { league_name: name })
  if (error) throw leagueError(error)
  return (data as { league_id: number }[])[0].league_id
}

/** The league behind an invite code, or undefined if there is none. */
export async function loadInvite(code: string): Promise<LeagueInvite | undefined> {
  const { data, error } = await client().rpc('fantasy_league_invite', { code })
  if (error) throw leagueError(error)
  const row = (
    data as {
      league_id: number
      name: string
      owner_nickname: string | null
      members: number
      joined: boolean
    }[]
  )[0]
  return (
    row && {
      leagueId: row.league_id,
      name: row.name,
      ownerNickname: row.owner_nickname ?? undefined,
      members: Number(row.members),
      joined: row.joined,
    }
  )
}

/** Joins the league with that invite code; returns its id. */
export async function joinLeague(code: string): Promise<number> {
  const { data, error } = await client().rpc('join_fantasy_league', { code })
  if (error) throw leagueError(error)
  return data as number
}

/** Leaves a league; its owner deletes it instead, for everyone. */
export async function leaveLeague(league: FantasyLeague, userId: string): Promise<void> {
  const db = client()
  const { error } =
    league.ownerId === userId
      ? await db.from('fantasy_leagues').delete().eq('id', league.id)
      : await db
          .from('fantasy_league_members')
          .delete()
          .eq('league_id', league.id)
          .eq('user_id', userId)
  if (error) throw leagueError(error)
}
