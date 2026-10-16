import type { OfficialClub, PoolPlayer } from '../engine/fantasy/official.ts'
import { marketClosesAt, type FantasyTeam } from '../engine/fantasy/team.ts'
import type { Formation } from '../engine/model/types.ts'
import { supabase } from './client.ts'

/** The official season as everyone sees it. */
export type FantasySeason = {
  id: number
  year: number
  status: 'em_andamento' | 'encerrada'
  rounds: number
  played: number
  clubs: Record<string, OfficialClub>
  lastPlayedAt: Date
}

/** What the fantasy screen needs: the season, the market and the player's own teams. */
export type FantasyView = {
  season: FantasySeason
  /** The market for the next round, at the prices after the last one. */
  pool: Record<string, PoolPlayer>
  /** Everyone's points in the last round played; empty before the first. */
  lastPoints: Record<string, number>
  /** The team already sent for the next round, or else the last one sent. */
  team?: FantasyTeam
  /** Whether `team` was sent for the next round itself. */
  teamIsForNext: boolean
  /** The player's points in the last round played, if they had a team in it. */
  lastScore?: number
  /** When the market for the next round closes; undefined once the season is over. */
  closesAt?: Date
}

type LineupRow = {
  round: number
  formation: Formation
  player_ids: string[]
  captain_id: string
  points: number | null
}

function client() {
  if (!supabase) throw new Error('O jogo online não está disponível nesta versão.')
  return supabase
}

/** The latest official season with its market, or undefined before the first one opens. */
export async function loadFantasy(userId?: string): Promise<FantasyView | undefined> {
  const db = client()
  const { data: row, error } = await db
    .from('fantasy_seasons')
    .select('id, year, status, rounds, played, clubs, last_played_at')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!row) return undefined
  const season: FantasySeason = {
    id: row.id,
    year: row.year,
    status: row.status,
    rounds: row.rounds,
    played: row.played,
    clubs: row.clubs,
    lastPlayedAt: new Date(row.last_played_at),
  }

  const [round, lineups] = await Promise.all([
    db
      .from('fantasy_rounds')
      .select('pool, points')
      .eq('season_id', season.id)
      .eq('round', season.played)
      .single(),
    userId
      ? db
          .from('fantasy_lineups')
          .select('round, formation, player_ids, captain_id, points')
          .eq('season_id', season.id)
          .eq('user_id', userId)
          .order('round', { ascending: false })
          .limit(2)
      : Promise.resolve({ data: [] as LineupRow[], error: null }),
  ])
  if (round.error) throw round.error
  if (lineups.error) throw lineups.error

  const rows = (lineups.data ?? []) as LineupRow[]
  const latest = rows[0]
  const scored = rows.find((r) => r.round === season.played)
  const open = season.status === 'em_andamento' && season.played < season.rounds
  return {
    season,
    pool: round.data.pool,
    lastPoints: round.data.points,
    team: latest && {
      formation: latest.formation,
      playerIds: latest.player_ids,
      captainId: latest.captain_id,
    },
    teamIsForNext: latest?.round === season.played + 1,
    lastScore: scored?.points ?? undefined,
    closesAt: open ? marketClosesAt(season.lastPlayedAt) : undefined,
  }
}

/** Sends the team for the next round; the server checks it again before saving. */
export async function saveFantasyTeam(team: FantasyTeam): Promise<void> {
  const { data, error } = await client().functions.invoke('fantasy-team', { body: team })
  if (error) {
    // The function answers rule breaks with a message for the player.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => undefined)
    throw new Error(body?.error ?? 'Não deu para salvar o time agora. Tente de novo.')
  }
  if (data?.error) throw new Error(data.error)
}
