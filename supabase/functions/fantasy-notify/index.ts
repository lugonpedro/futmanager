// Sends the fantasy game's push notifications. pg_cron calls it twice a day
// with the shared secret: before the market closes ({"kind": "mercado"}) and
// after the round is played ({"kind": "rodada"}). Each notice goes out once;
// subscriptions the push service says are gone are deleted.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import {
  dueMarketWarning,
  dueRoundNotice,
  marketNotice,
  roundNotice,
  type Notice,
  type NoticeKind,
} from '../../../src/cloud/notices.ts'
import { sendPush, type PushTarget, type VapidKeys } from '../../../src/cloud/webpush.ts'

const PAGE = 1000
/** How many notifications go out at the same time. */
const BATCH = 25

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

type Subscription = PushTarget & { user_id: string }

async function subscriptions(db: SupabaseClient, kind: NoticeKind) {
  const out: Subscription[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth, user_id')
      .eq(kind === 'mercado' ? 'market' : 'rounds', true)
      .order('endpoint')
      .range(from, from + PAGE - 1)
    if (error) throw error
    out.push(...(data as Subscription[]))
    if (data.length < PAGE) return out
  }
}

/** Everyone's points in a round, by user; or, for a round not played, just who sent a team. */
async function lineups(db: SupabaseClient, seasonId: number, round: number) {
  const out = new Map<string, number | null>()
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from('fantasy_lineups')
      .select('user_id, points')
      .eq('season_id', seasonId)
      .eq('round', round)
      .order('user_id')
      .range(from, from + PAGE - 1)
    if (error) throw error
    for (const row of data as { user_id: string; points: number | null }[])
      out.set(row.user_id, row.points)
    if (data.length < PAGE) return out
  }
}

/** Sends each notice and forgets the subscriptions that no longer exist. */
async function deliver(
  db: SupabaseClient,
  messages: { target: Subscription; notice: Notice }[],
  keys: VapidKeys,
) {
  const count = { enviado: 0, expirado: 0, falhou: 0 }
  const gone: string[] = []
  for (let i = 0; i < messages.length; i += BATCH) {
    const outcomes = await Promise.all(
      messages
        .slice(i, i + BATCH)
        .map(({ target, notice }) =>
          sendPush(target, notice, keys, notice.tag).catch(() => 'falhou' as const),
        ),
    )
    outcomes.forEach((outcome, j) => {
      count[outcome]++
      if (outcome === 'expirado') gone.push(messages[i + j].target.endpoint)
    })
  }
  for (let i = 0; i < gone.length; i += PAGE) {
    const { error } = await db
      .from('push_subscriptions')
      .delete()
      .in('endpoint', gone.slice(i, i + PAGE))
    if (error) throw error
  }
  return count
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('FANTASY_CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret)
    return json({ error: 'forbidden' }, 403)
  const { kind } = (await req.json().catch(() => ({}))) as { kind?: string }
  if (kind !== 'mercado' && kind !== 'rodada') return json({ error: 'bad kind' }, 400)

  const keys: VapidKeys = {
    publicKey: Deno.env.get('VAPID_PUBLIC_KEY')!,
    privateKey: Deno.env.get('VAPID_PRIVATE_KEY')!,
    subject: Deno.env.get('VAPID_SUBJECT')!,
  }
  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  try {
    const { data: row, error } = await db
      .from('fantasy_seasons')
      .select('id, status, played, rounds, last_played_at')
      .order('id', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error) throw error
    if (!row) return json({ skipped: 'sem temporada' })
    const season = { ...row, lastPlayedAt: new Date(row.last_played_at) }
    const now = new Date()
    const market = kind === 'mercado' ? dueMarketWarning(season, now) : undefined
    const due = kind === 'mercado' ? market : dueRoundNotice(season, now)
    if (!due) return json({ skipped: 'nada a avisar' })

    // Claimed before sending, so a second call never sends it again.
    const { error: claimError } = await db
      .from('fantasy_notices')
      .insert({ season_id: season.id, round: due.round, kind })
    if (claimError?.code === '23505') return json({ skipped: 'já avisado' })
    if (claimError) throw claimError

    const teams = await lineups(db, season.id, due.round)
    const targets = await subscriptions(db, kind)
    const messages = market
      ? targets
          .filter((t) => !teams.has(t.user_id))
          .map((target) => ({ target, notice: marketNotice(market.round, market.closesAt) }))
      : targets.map((target) => ({
          target,
          notice: roundNotice(due.round, teams.get(target.user_id) ?? undefined),
        }))
    return json({ kind, round: due.round, ...(await deliver(db, messages, keys)) })
  } catch (error) {
    console.error(error)
    return json({ error: String((error as Error).message ?? error) }, 500)
  }
})
