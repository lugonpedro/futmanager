// Pure helpers for selling the pass through Mercado Pago's Checkout Pro.
// They run in the Supabase functions (Deno) and in the tests (Node): only Web
// Crypto.

/** What the pass costs, in cents. The screen and the checkout both read it. */
export const PASS_PRICE_CENTS = 500

/** How many days one payment adds to the pass. */
export const PASS_DAYS = 30

const hex = (bytes: ArrayBuffer) =>
  [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')

/**
 * The text Mercado Pago signs for a notification: the resource id from the
 * URL (lowercase when it has letters), the `x-request-id` header and the
 * `ts` of `x-signature`. A part that didn't come is left out.
 */
export function signedManifest(dataId: string | null, requestId: string | null, ts: string) {
  return [
    dataId ? `id:${dataId.toLowerCase()};` : '',
    requestId ? `request-id:${requestId};` : '',
    `ts:${ts};`,
  ].join('')
}

/** The `v1` of `x-signature`: an HMAC-SHA256 of the manifest with the webhook secret. */
export async function mercadoPagoSignature(manifest: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  )
  return hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(manifest)))
}

/** Compares without stopping at the first difference, so timing says nothing. */
function sameText(a: string, b: string) {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

/**
 * Whether a notification really comes from Mercado Pago: `x-signature` holds
 * `ts=<time>,v1=<hex>`. The pass is only granted after reading the payment
 * back from the API, so a replayed notification can't grant anything new.
 */
export async function verifyMercadoPagoSignature(params: {
  header: string | null
  requestId: string | null
  dataId: string | null
  secret: string
}): Promise<boolean> {
  if (!params.header) return false
  const parts = params.header.split(',').map((p) => p.trim().split('=') as [string, string])
  const ts = parts.find(([k]) => k === 'ts')?.[1]
  const v1 = parts.find(([k]) => k === 'v1')?.[1]
  if (!ts || !v1) return false
  const expected = await mercadoPagoSignature(
    signedManifest(params.dataId, params.requestId, ts),
    params.secret,
  )
  return sameText(v1, expected)
}

/** The body Mercado Pago's API takes to open a Checkout Pro page for the pass. */
export function passPreference(params: {
  userId: string
  email?: string
  siteUrl: string
  notificationUrl: string
}) {
  const page = `${params.siteUrl}/passe`
  return {
    items: [
      {
        id: `passe-${PASS_DAYS}-dias`,
        title: `Passe de ${PASS_DAYS} dias`,
        quantity: 1,
        currency_id: 'BRL',
        unit_price: PASS_PRICE_CENTS / 100,
      },
    ],
    external_reference: params.userId,
    metadata: { user_id: params.userId },
    ...(params.email ? { payer: { email: params.email } } : {}),
    back_urls: {
      success: `${page}?pagamento=ok`,
      pending: `${page}?pagamento=pendente`,
      failure: page,
    },
    auto_return: 'approved',
    notification_url: params.notificationUrl,
    // Boleto takes days and costs more than the pass is worth; cards pay at once.
    payment_methods: { excluded_payment_types: [{ id: 'ticket' }], installments: 1 },
    statement_descriptor: 'ONZEMESTRE',
  }
}

/** A paid pass, as the payment read back from Mercado Pago tells it. */
export type PassPayment = {
  userId: string
  paymentId: string
  amountCents: number
}

type Payment = {
  id?: number | string
  status?: string
  external_reference?: string
  transaction_amount?: number
}

/** The pass a payment pays for, if it was approved. Pix may stay pending for a while first. */
export function passPayment(payment: Payment): PassPayment | undefined {
  if (payment.status !== 'approved' || payment.id === undefined) return undefined
  // The season passes carried `<user>:<season>`; only the user counts now.
  const [userId] = (payment.external_reference ?? '').split(':')
  if (!userId) return undefined
  return {
    userId,
    paymentId: String(payment.id),
    amountCents: Math.round((payment.transaction_amount ?? 0) * 100),
  }
}
