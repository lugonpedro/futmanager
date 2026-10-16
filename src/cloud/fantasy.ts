import type { OfficialClub, PoolPlayer } from '../engine/fantasy/official.ts'
import { marketClosesAt, type FantasyTeam } from '../engine/fantasy/team.ts'
import type { MatchReplay } from '../engine/match/simulate.ts'
import type { Formation, MatchResult } from '../engine/model/types.ts'
import type { GameDate } from '../engine/season/calendar.ts'
import { supabase } from './client.ts'
import { unpackJson } from './codec.ts'

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

/** The latest official season, or undefined before the first one opens. */
export async function loadFantasySeason(): Promise<FantasySeason | undefined> {
  const { data: row, error } = await client()
    .from('fantasy_seasons')
    .select('id, year, status, rounds, played, clubs, last_played_at')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  if (!row) return undefined
  return {
    id: row.id,
    year: row.year,
    status: row.status,
    rounds: row.rounds,
    played: row.played,
    clubs: row.clubs,
    lastPlayedAt: new Date(row.last_played_at),
  }
}

/** The latest official season with its market, or undefined before the first one opens. */
export async function loadFantasy(userId?: string): Promise<FantasyView | undefined> {
  const db = client()
  const season = await loadFantasySeason()
  if (!season) return undefined

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

/** A played round as the round screen shows it. */
export type FantasyRoundView = {
  round: number
  date: GameDate
  /** The top-division matches, and what it takes to watch each again. */
  results: MatchResult[]
  replays: MatchReplay[]
  points: Record<string, number>
  /** The market the round's teams were picked from. */
  pool: Record<string, PoolPlayer>
  /** The player's team in the round, with what it scored. */
  team?: FantasyTeam & { points?: number }
}

/** One played round of the season, with the player's team in it when signed in. */
export async function loadFantasyRound(
  seasonId: number,
  round: number,
  userId?: string,
): Promise<FantasyRoundView> {
  const db = client()
  const [played, market, lineup] = await Promise.all([
    db
      .from('fantasy_rounds')
      .select('game_date, results, points, replays')
      .eq('season_id', seasonId)
      .eq('round', round)
      .single(),
    db
      .from('fantasy_rounds')
      .select('pool')
      .eq('season_id', seasonId)
      .eq('round', round - 1)
      .single(),
    userId
      ? db
          .from('fantasy_lineups')
          .select('round, formation, player_ids, captain_id, points')
          .eq('season_id', seasonId)
          .eq('user_id', userId)
          .eq('round', round)
          .maybeSingle()
      : Promise.resolve({ data: null, error: null }),
  ])
  if (played.error) throw played.error
  if (market.error) throw market.error
  if (lineup.error) throw lineup.error
  const row = lineup.data as LineupRow | null
  return {
    round,
    date: played.data.game_date,
    results: played.data.results,
    replays: played.data.replays ? await unpackJson<MatchReplay[]>(played.data.replays) : [],
    points: played.data.points,
    pool: market.data.pool,
    team: row
      ? {
          formation: row.formation,
          playerIds: row.player_ids,
          captainId: row.captain_id,
          points: row.points ?? undefined,
        }
      : undefined,
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
