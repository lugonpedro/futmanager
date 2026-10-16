// Receives Stripe's events and grants the season pass once a Checkout is paid.
// Stripe signs each event with the webhook secret; anything unsigned, or
// signed too long ago, is refused. Granting twice changes nothing, since
// Stripe may deliver the same event more than once.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { passPayment, verifyStripeSignature } from '../../../src/cloud/stripe.ts'

Deno.serve(async (req) => {
  const payload = await req.text()
  const signed = await verifyStripeSignature(
    payload,
    req.headers.get('Stripe-Signature'),
    Deno.env.get('STRIPE_WEBHOOK_SECRET')!,
    Math.floor(Date.now() / 1000),
  )
  if (!signed) return new Response('bad signature', { status: 400 })

  const paid = passPayment(JSON.parse(payload))
  if (!paid) return new Response('ignored')

  const db = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  )
  const { error } = await db.from('fantasy_passes').upsert(
    {
      user_id: paid.userId,
      season_id: paid.seasonId,
      provider: 'stripe',
      payment_id: paid.paymentId,
      amount_cents: paid.amountCents,
    },
    { onConflict: 'user_id,season_id', ignoreDuplicates: true },
  )
  if (error) {
    // A 500 makes Stripe try again later.
    console.error(error)
    return new Response('error', { status: 500 })
  }
  return new Response('ok')
})
