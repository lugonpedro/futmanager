// Sends a room's push notices. Only the database calls it, with the shared
// secret, when a notice is due (see 20261031000000_avisos_sala.sql): to the
// people of some teams, or to everyone in the room. Each person gets it on
// every browser where they turned on that kind of notice; subscriptions the
// push service says are gone are deleted.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'
import { isNoticeKind, NOTICE_PREF, roomNotice } from '../../../src/cloud/roomNotices.ts'
import { sendPush, type PushTarget, type VapidKeys } from '../../../src/cloud/webpush.ts'
import { json } from '../_shared/roomState.ts'

/** How many notifications go out at the same time. */
const BATCH = 25

/** The people a notice goes to: some teams' people, or everyone in the room. */
async function recipients(db: SupabaseClient, room: number, slots: number[] | null) {
  if (slots) {
    const { data, error } = await db
      .from('room_teams')
      .select('user_id')
      .eq('room_id', room)
      .in('slot', slots)
      .not('user_id', 'is', null)
    if (error) throw error
    return (data as { user_id: string }[]).map((r) => r.user_id)
  }
  const { data, error } = await db.from('room_members').select('user_id').eq('room_id', room)
  if (error) throw error
  return (data as { user_id: string }[]).map((r) => r.user_id)
}

Deno.serve(async (req) => {
  const secret = Deno.env.get('FANTASY_CRON_SECRET')
  if (!secret || req.headers.get('x-cron-secret') !== secret)
    return json({ error: 'forbidden' }, 403)
  const body = await req.json().catch(() => ({}))
  const room = Number(body?.room)
  const kind = body?.kind
  const slots = Array.isArray(body?.slots) ? (body.slots as number[]) : null
  if (!Number.isInteger(room) || !isNoticeKind(kind)) return json({ error: 'bad notice' }, 400)

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
    const { data: found, error } = await db
      .from('rooms')
      .select('id, name, pick_seconds')
      .eq('id', room)
      .maybeSingle()
    if (error) throw error
    if (!found) return json({ skipped: 'sala apagada' })

    // A trade offer names who made it.
    let from: string | undefined
    if (kind === 'troca' && Number.isInteger(body?.data?.from)) {
      const team = await db
        .from('room_teams')
        .select('team_name')
        .eq('room_id', room)
        .eq('slot', body.data.from)
        .maybeSingle()
      from = team.data?.team_name
    }
    const notice = roomNotice(
      kind,
      { id: found.id, name: found.name, pickSeconds: found.pick_seconds },
      { round: body?.data?.round, over: body?.data?.over === true, from },
    )

    const users = await recipients(db, room, slots)
    if (users.length === 0) return json({ sent: 0 })
    const { data: subs, error: subError } = await db
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .in('user_id', users)
      .eq(NOTICE_PREF[kind], true)
    if (subError) throw subError

    const targets = subs as PushTarget[]
    const count = { enviado: 0, expirado: 0, falhou: 0 }
    const gone: string[] = []
    for (let i = 0; i < targets.length; i += BATCH) {
      const batch = targets.slice(i, i + BATCH)
      const outcomes = await Promise.all(
        batch.map((target) =>
          sendPush(target, notice, keys, notice.tag).catch(() => 'falhou' as const),
        ),
      )
      outcomes.forEach((outcome, j) => {
        count[outcome]++
        if (outcome === 'expirado') gone.push(batch[j].endpoint)
      })
    }
    if (gone.length > 0) {
      const removed = await db.from('push_subscriptions').delete().in('endpoint', gone)
      if (removed.error) throw removed.error
    }
    return json(count)
  } catch (error) {
    console.error(error)
    return json({ error: 'falhou' }, 500)
  }
})
