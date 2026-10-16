// Pure helpers for selling the season pass through Stripe Checkout. They run
// in the Supabase functions (Deno) and in the tests (Node): only Web Crypto.

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

/** The `v1` signature Stripe sends for a payload signed at `timestamp` (seconds). */
export async function stripeSignature(
  payload: string,
  secret: string,
  timestamp: number,
): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  const mac = await crypto.subtle.sign(
    'HMAC',
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  )
  return hex(mac)
}

/** Compares without stopping at the first difference, so timing says nothing. */
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Whether a webhook really comes from Stripe: the `Stripe-Signature` header
 * holds `t=<seconds>` and one or more `v1=<hex>`, an HMAC of `t.payload`. Old
 * signatures are refused, so a captured request can't be replayed later.
 */
export async function verifyStripeSignature(
  payload: string,
  header: string | null,
  secret: string,
  nowSeconds: number,
  toleranceSeconds = 300,
): Promise<boolean> {
  if (!header) return false
  const parts = header.split(',').map((p) => p.split('=') as [string, string])
  const timestamp = Number(parts.find(([k]) => k === 't')?.[1])
  if (!Number.isFinite(timestamp) || Math.abs(nowSeconds - timestamp) > toleranceSeconds)
    return false
  const expected = await stripeSignature(payload, secret, timestamp)
  return parts.some(([k, v]) => k === 'v1' && v !== undefined && sameText(v, expected))
}

/** The form Stripe's API takes to open a Checkout page for the season pass. */
export function passCheckoutForm(params: {
  priceId: string
  userId: string
  seasonId: number
  email?: string
  siteUrl: string
}): URLSearchParams {
  const form = new URLSearchParams({
    mode: 'payment',
    'line_items[0][price]': params.priceId,
    'line_items[0][quantity]': '1',
    client_reference_id: params.userId,
    'metadata[user_id]': params.userId,
    'metadata[season_id]': String(params.seasonId),
    'payment_intent_data[metadata][user_id]': params.userId,
    'payment_intent_data[metadata][season_id]': String(params.seasonId),
    success_url: `${params.siteUrl}/fantasia/passe?pagamento=ok`,
    cancel_url: `${params.siteUrl}/fantasia/passe`,
    locale: 'pt-BR',
  })
  if (params.email) form.set('customer_email', params.email)
  return form
}

/** A paid pass, as a webhook event tells it. */
export type PassPayment = {
  userId: string
  seasonId: number
  paymentId: string
  amountCents: number
}

type CheckoutSession = {
  id: string
  payment_status?: string
  amount_total?: number
  metadata?: Record<string, string>
}

/**
 * The pass a webhook event pays for, if any. A card is paid when the Checkout
 * completes; Pix and other delayed methods may complete first and be paid
 * later, in `checkout.session.async_payment_succeeded`.
 */
export function passPayment(event: {
  type?: string
  data?: { object?: unknown }
}): PassPayment | undefined {
  if (
    event.type !== 'checkout.session.completed' &&
    event.type !== 'checkout.session.async_payment_succeeded'
  )
    return undefined
  const session = event.data?.object as CheckoutSession | undefined
  if (!session || session.payment_status !== 'paid') return undefined
  const userId = session.metadata?.user_id
  const seasonId = Number(session.metadata?.season_id)
  if (!userId || !Number.isInteger(seasonId)) return undefined
  return { userId, seasonId, paymentId: session.id, amountCents: session.amount_total ?? 0 }
}
