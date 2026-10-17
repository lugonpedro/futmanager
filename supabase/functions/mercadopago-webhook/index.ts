// Receives Mercado Pago's notifications and grants the season pass once a
// payment is approved. A notification only carries the payment's id, so the
// payment is read back from the API with the access token: that answer, not
// the notification, decides. Granting twice changes nothing, since Mercado
// Pago may notify the same payment more than once.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { passPayment, verifyMercadoPagoSignature } from '../../../src/cloud/mercadopago.ts'

Deno.serve(async (req) => {
  const url = new URL(req.url)
  const body = await req.json().catch(() => ({}))
  const type = body?.type ?? url.searchParams.get('type') ?? url.searchParams.get('topic')
  const dataId = url.searchParams.get('data.id') ?? url.searchParams.get('id')
  const paymentId = dataId ?? body?.data?.id
  if (type !== 'payment' || !paymentId) return new Response('ignored')

  // Webhooks come signed; the older IPN form doesn't, and the API read below
  // keeps that one honest.
  const header = req.headers.get('x-signature')
  const secret = Deno.env.get('MP_WEBHOOK_SECRET')
  if (header && secret) {
    const signed = await verifyMercadoPagoSignature({
      header,
      requestId: req.headers.get('x-request-id'),
      dataId,
      secret,
    })
    if (!signed) return new Response('bad signature', { status: 400 })
  }

  const response = await fetch(
    `https://api.mercadopago.com/v1/payments/${encodeURIComponent(String(paymentId))}`,
    { headers: { Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}` } },
  )
  if (response.status === 404) return new Response('ignored')
  if (!response.ok) {
    // A 500 makes Mercado Pago try again later.
    console.error(`Mercado Pago ${response.status}`, await response.text())
    return new Response('error', { status: 500 })
  }
  const paid = passPayment(await response.json())
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
      provider: 'mercadopago',
      payment_id: paid.paymentId,
      amount_cents: paid.amountCents,
    },
    { onConflict: 'user_id,season_id', ignoreDuplicates: true },
  )
  if (error) {
    console.error(error)
    return new Response('error', { status: 500 })
  }
  return new Response('ok')
})
