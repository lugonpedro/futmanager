// Starts a room's draft: lists the pack's players, turns the people and the
// robots into the room's teams and draws the order (src/engine/room/start.ts).
// Called by the room's owner to start early, and every minute by pg_cron for
// the drafts whose time came (see 20261027000000_draft.sql). Calling it twice
// is harmless: the database closes the waiting room once, the seed is stored
// before anything is built from it, and the order is set only once.
import { createClient } from 'npm:@supabase/supabase-js@2'
import brasileirao from '../../../src/packs/brasileirao-2026.json' with { type: 'json' }
import { packJson } from '../../../src/cloud/codec.ts'
import { parsePackFile } from '../../../src/engine/pack/file.ts'
import { startDraft } from '../../../src/engine/room/start.ts'
import { withOveralls } from '../../../src/packs/ratings.ts'
import type { RoomOptions } from '../../../src/engine/room/types.ts'

const PACKS: Record<string, unknown> = { 'brasileirao-2026': brasileirao }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

type Person = {
  needs_setup: boolean
  user_id: string
  team_name: string
  short_name: string
  color_primary: string
  color_secondary: string
}

const CHUNK = 500

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = Deno.env.get('SUPABASE_URL')!
  const room = Number((await req.json().catch(() => ({})))?.room)
  if (!Number.isInteger(room)) return json({ error: 'Sala inválida.' }, 400)

  // The cron job carries the shared secret; anyone else must be the owner of a waiting room.
  const secret = Deno.env.get('FANTASY_CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret) {
    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      auth: { persistSession: false },
    })
    const { data: allowed } = await asUser.rpc('can_start_draft', { room })
    if (allowed !== true) return json({ error: 'Só quem criou a sala começa o draft.' }, 403)
  }

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  try {
    const { data: people, error } = await db.rpc('room_begin_draft', { room })
    if (error) throw error
    const rows = people as Person[]
    if (rows.length === 0 || !rows[0].needs_setup) return json({ ok: true, started: false })

    // The seed is stored first, so a second call builds the very same draft.
    const fresh = crypto.getRandomValues(new Uint32Array(1))[0] >>> 1
    const stored = await db
      .from('room_states')
      .upsert({ room_id: room, seed: fresh }, { onConflict: 'room_id', ignoreDuplicates: true })
    if (stored.error) throw stored.error
    const { data: state, error: seedError } = await db
      .from('room_states')
      .select('seed')
      .eq('room_id', room)
      .single()
    if (seedError) throw seedError

    const { data: options, error: roomError } = await db
      .from('rooms')
      .select(
        'pack, teams, squad_size, draft_order, pick_seconds, auto_reserves, legs, injuries, trades',
      )
      .eq('id', room)
      .single()
    if (roomError) throw roomError
    const pack = parsePackFile(
      JSON.stringify(withOveralls(PACKS[options.pack])),
      `${options.pack}.json`,
    ).pack
    const roomOptions: RoomOptions = {
      teams: options.teams,
      squadSize: options.squad_size,
      draftOrder: options.draft_order,
      pickSeconds: options.pick_seconds,
      autoReserves: options.auto_reserves,
      legs: options.legs,
      injuries: options.injuries,
      trades: options.trades,
    }
    const draft = startDraft(
      Number(state.seed),
      pack,
      rows.map((p) => ({
        name: p.team_name,
        shortName: p.short_name,
        colors: { primary: p.color_primary, secondary: p.color_secondary },
      })),
      roomOptions,
    )

    const teams = await db.from('room_teams').upsert(
      draft.state.teams.map((team, slot) => ({
        room_id: room,
        slot,
        user_id: team.robot ? null : rows[slot].user_id,
        team_name: team.name,
        short_name: team.shortName,
        color_primary: team.colors.primary,
        color_secondary: team.colors.secondary,
        robot: team.robot,
      })),
      { onConflict: 'room_id,slot' },
    )
    if (teams.error) throw teams.error
    for (let from = 0; from < draft.pool.length; from += CHUNK) {
      const chunk = await db.from('room_pool').upsert(
        draft.pool.slice(from, from + CHUNK).map((p) => ({
          room_id: room,
          player_id: p.id,
          name: p.name,
          position: p.position,
          overall: p.overall,
          age: p.age,
          origin: p.origin,
          rank: p.rank,
        })),
        { onConflict: 'room_id,player_id', ignoreDuplicates: true },
      )
      if (chunk.error) throw chunk.error
    }
    const saved = await db
      .from('room_states')
      .update({ data: await packJson(draft.state) })
      .eq('room_id', room)
    if (saved.error) throw saved.error

    const opened = await db.rpc('room_open_draft', {
      room,
      pick_order: draft.state.order.map(Number),
      squad_shape: draft.shape,
    })
    if (opened.error) throw opened.error
    return json({ ok: true, started: true })
  } catch (error) {
    console.error(error)
    return json({ error: 'Não deu para começar o draft agora. Tente de novo.' }, 500)
  }
})
