import { describe, expect, it } from 'vitest'
import { passCheckoutForm, passPayment, stripeSignature, verifyStripeSignature } from './stripe.ts'

const secret = 'whsec_test'
const payload = '{"id":"evt_1","type":"checkout.session.completed"}'

describe('verifyStripeSignature', () => {
  it('accepts what Stripe signs and refuses anything else', async () => {
    const t = 1_760_000_000
    const v1 = await stripeSignature(payload, secret, t)
    expect(await verifyStripeSignature(payload, `t=${t},v1=${v1}`, secret, t + 10)).toBe(true)
    // Several v1 entries happen while a secret is being rolled.
    expect(await verifyStripeSignature(payload, `t=${t},v1=abc,v1=${v1}`, secret, t)).toBe(true)
    expect(await verifyStripeSignature(payload + ' ', `t=${t},v1=${v1}`, secret, t)).toBe(false)
    expect(await verifyStripeSignature(payload, `t=${t},v1=${v1}`, 'other', t)).toBe(false)
    expect(await verifyStripeSignature(payload, `t=${t + 1},v1=${v1}`, secret, t)).toBe(false)
    expect(await verifyStripeSignature(payload, null, secret, t)).toBe(false)
  })

  it('refuses an old signature, so a request cannot be replayed', async () => {
    const t = 1_760_000_000
    const v1 = await stripeSignature(payload, secret, t)
    expect(await verifyStripeSignature(payload, `t=${t},v1=${v1}`, secret, t + 301)).toBe(false)
  })

  it('matches the HMAC-SHA256 Stripe documents', async () => {
    // printf '1.{}' | openssl dgst -sha256 -hmac key
    expect(await stripeSignature('{}', 'key', 1)).toBe(
      '1ba6b8171186efc613e8bcc0cbdab2748f24984d7c5a84faa2637afa0e40d224',
    )
  })
})

describe('passCheckoutForm', () => {
  it('sells one pass and carries who buys it for which season', () => {
    const form = passCheckoutForm({
      priceId: 'price_1',
      userId: 'u1',
      seasonId: 3,
      email: 'a@b.com',
      siteUrl: 'https://futmanager.app',
    })
    expect(form.get('mode')).toBe('payment')
    expect(form.get('line_items[0][price]')).toBe('price_1')
    expect(form.get('metadata[user_id]')).toBe('u1')
    expect(form.get('metadata[season_id]')).toBe('3')
    expect(form.get('customer_email')).toBe('a@b.com')
    expect(form.get('success_url')).toBe('https://futmanager.app/fantasia/passe?pagamento=ok')
  })
})

describe('passPayment', () => {
  const session = {
    id: 'cs_1',
    payment_status: 'paid',
    amount_total: 990,
    metadata: { user_id: 'u1', season_id: '3' },
  }

  it('reads a paid Checkout', () => {
    expect(passPayment({ type: 'checkout.session.completed', data: { object: session } })).toEqual({
      userId: 'u1',
      seasonId: 3,
      paymentId: 'cs_1',
      amountCents: 990,
    })
    expect(
      passPayment({ type: 'checkout.session.async_payment_succeeded', data: { object: session } }),
    ).toBeDefined()
  })

  it('ignores a Checkout still waiting for its payment, and other events', () => {
    const unpaid = { ...session, payment_status: 'unpaid' }
    expect(
      passPayment({ type: 'checkout.session.completed', data: { object: unpaid } }),
    ).toBeUndefined()
    expect(passPayment({ type: 'charge.refunded', data: { object: session } })).toBeUndefined()
    expect(
      passPayment({
        type: 'checkout.session.completed',
        data: { object: { ...session, metadata: {} } },
      }),
    ).toBeUndefined()
  })
})
