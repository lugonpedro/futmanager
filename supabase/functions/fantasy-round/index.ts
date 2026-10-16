// Plays the official fantasy season, once a day: opens a season when none is
// running, otherwise plays its next league round. Called by pg_cron with the
// shared secret (see the migration 20261016000000_temporada_oficial.sql).
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import packFile from '../../../src/packs/brasileirao-2026.json' with { type: 'json' }
import { packJson, unpackJson } from '../../../src/cloud/codec.ts'
import {
  FANTASY_VERSION,
  nextOfficialSeason,
  officialClubs,
  officialRounds,
  officialSeasonOver,
  playOfficialRound,
  startOfficialSeason,
  type OfficialRound,
  type OfficialState,
} from '../../../src/engine/fantasy/official.ts'
import { scoreLineups, type Lineup } from '../../../src/engine/fantasy/team.ts'
import type { Formation } from '../../../src/engine/model/types.ts'
import { parsePackFile } from '../../../src/engine/pack/file.ts'

/** A second call within this many hours does nothing, so a retry never plays two rounds. */
const MIN_GAP_HOURS = 20

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

function roundRow(seasonId: number, round: OfficialRound) {
  return {
    season_id: seasonId,
    round: round.round,
    game_date: round.date,
    results: round.results,
    points: round.points,
    pool: round.pool,
  }
}

async function openSeason(db: SupabaseClient) {
  const { data: last, error } = await db
    .from('fantasy_seasons')
    .select('id')
    .eq('status', 'encerrada')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error

  let seed: number
  let opened: { state: OfficialState; round: OfficialRound }
  if (last) {
    const { data: stored, error: loadError } = await db
      .from('fantasy_season_states')
      .select('seed, data')
      .eq('season_id', last.id)
      .single()
    if (loadError) throw loadError
    seed = stored.seed
    opened = nextOfficialSeason(await unpackJson<OfficialState>(stored.data))
  } else {
    seed = crypto.getRandomValues(new Uint32Array(1))[0]
    const pack = parsePackFile(JSON.stringify(packFile), 'brasileirao-2026.json').pack
    opened = startOfficialSeason(seed, pack)
  }

  const { data: season, error: seasonError } = await db
    .from('fantasy_seasons')
    .insert({
      year: opened.state.game.season.year,
      status: 'em_andamento',
      rules_version: FANTASY_VERSION,
      rounds: officialRounds(opened.state),
      clubs: officialClubs(opened.state),
    })
    .select('id')
    .single()
  if (seasonError) throw seasonError
  const writes = await Promise.all([
    db.from('fantasy_season_states').insert({
      season_id: season.id,
      seed,
      data: await packJson(opened.state),
    }),
    db.from('fantasy_rounds').insert(roundRow(season.id, opened.round)),
  ])
  for (const { error: writeError } of writes) if (writeError) throw writeError
  return { opened: season.id, year: opened.state.game.season.year }
}

type LineupRow = {
  user_id: string
  round: number
  formation: Formation
  player_ids: string[]
  captain_id: string
}

const PAGE = 1000

/** Scores everyone's team for the round just played, carrying over the last team sent. */
async function scoreRound(db: SupabaseClient, seasonId: number, round: OfficialRound) {
  const lineups: Lineup[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('fantasy_lineups')
      .select('user_id, round, formation, player_ids, captain_id')
      .eq('season_id', seasonId)
      .lte('round', round.round)
      .order('user_id')
      .order('round')
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const row of data as LineupRow[]) {
      lineups.push({
        userId: row.user_id,
        round: row.round,
        formation: row.formation,
        playerIds: row.player_ids,
        captainId: row.captain_id,
      })
    }
    if (data.length < PAGE) break
  }
  const scored = scoreLineups(lineups, round.round, round.points)
  for (let i = 0; i < scored.length; i += PAGE) {
    const { error } = await db.from('fantasy_lineups').upsert(
      scored.slice(i, i + PAGE).map((l) => ({
        user_id: l.userId,
        season_id: seasonId,
        round: l.round,
        formation: l.formation,
        player_ids: l.playerIds,
        captain_id: l.captainId,
        points: l.points,
      })),
    )
    if (error) throw error
  }
  return scored.length
}

async function playRound(db: SupabaseClient, seasonId: number) {
  const { data: stored, error } = await db
    .from('fantasy_season_states')
    .select('data')
    .eq('season_id', seasonId)
    .single()
  if (error) throw error
  const played = playOfficialRound(await unpackJson<OfficialState>(stored.data))

  // The round goes in first: if two calls race, the second one stops here.
  const { error: roundError } = await db
    .from('fantasy_rounds')
    .insert(roundRow(seasonId, played.round))
  if (roundError) throw roundError
  const teams = await scoreRound(db, seasonId, played.round)
  const { error: stateError } = await db
    .from('fantasy_season_states')
    .update({ data: await packJson(played.state), updated_at: new Date().toISOString() })
    .eq('season_id', seasonId)
  if (stateError) throw stateError
  const over = officialSeasonOver(played.state)
  const { error: seasonError } = await db
    .from('fantasy_seasons')
    .update({
      played: played.round.round,
      last_played_at: new Date().toISOString(),
      ...(over && { status: 'encerrada' }),
    })
    .eq('id', seasonId)
  if (seasonError) throw seasonError
  return { season: seasonId, round: played.round.round, teams, over }
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('FANTASY_CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret)
    return json({ error: 'forbidden' }, 403)
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false },
    },
  )
  try {
    const { data: season, error } = await db
      .from('fantasy_seasons')
      .select('id, status, last_played_at')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    // The day a season closes, the next one waits until tomorrow.
    if (season && Date.now() - Date.parse(season.last_played_at) < MIN_GAP_HOURS * 3_600_000) {
      return json({ skipped: true, season: season.id })
    }
    if (season?.status !== 'em_andamento') return json(await openSeason(db))
    return json(await playRound(db, season.id))
  } catch (error) {
    console.error(error)
    return json({ error: String((error as Error).message ?? error) }, 500)
  }
})
