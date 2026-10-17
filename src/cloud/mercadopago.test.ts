import { describe, expect, it } from 'vitest'
import {
  mercadoPagoSignature,
  passPayment,
  passPreference,
  signedManifest,
  verifyMercadoPagoSignature,
} from './mercadopago.ts'

const secret = 'mp_secret'

describe('verifyMercadoPagoSignature', () => {
  it('accepts what Mercado Pago signs and refuses anything else', async () => {
    const ts = '1760000000'
    const v1 = await mercadoPagoSignature(signedManifest('123', 'req-1', ts), secret)
    const check = (header: string | null, dataId = '123', key = secret) =>
      verifyMercadoPagoSignature({ header, requestId: 'req-1', dataId, secret: key })
    expect(await check(`ts=${ts},v1=${v1}`)).toBe(true)
    expect(await check(`ts=${ts}, v1=${v1}`)).toBe(true)
    expect(await check(`ts=${ts},v1=${v1}`, '124')).toBe(false)
    expect(await check(`ts=${ts},v1=${v1}`, '123', 'other')).toBe(false)
    expect(await check(`ts=1760000001,v1=${v1}`)).toBe(false)
    expect(await check(`ts=${ts}`)).toBe(false)
    expect(await check(null)).toBe(false)
  })

  it('builds the manifest Mercado Pago documents', () => {
    expect(signedManifest('ABC1', 'req', '9')).toBe('id:abc1;request-id:req;ts:9;')
    expect(signedManifest(null, 'req', '9')).toBe('request-id:req;ts:9;')
  })

  it('matches HMAC-SHA256', async () => {
    // printf 'id:123;request-id:abc;ts:1700000000;' | openssl dgst -sha256 -hmac key
    expect(await mercadoPagoSignature('id:123;request-id:abc;ts:1700000000;', 'key')).toBe(
      '2066a087f748fc6bdbe57a7167142ee813c25a682d011384e8ea93c8149af2ce',
    )
  })
})

describe('passPreference', () => {
  it('sells one pass and carries who buys it for which season', () => {
    const body = passPreference({
      userId: 'u1',
      seasonId: 3,
      email: 'a@b.com',
      siteUrl: 'https://onzemestre.com',
      notificationUrl: 'https://x.supabase.co/functions/v1/mercadopago-webhook',
    })
    expect(body.items).toEqual([
      expect.objectContaining({ quantity: 1, currency_id: 'BRL', unit_price: 5 }),
    ])
    expect(body.external_reference).toBe('u1:3')
    expect(body.payer).toEqual({ email: 'a@b.com' })
    expect(body.back_urls.success).toBe('https://onzemestre.com/fantasia/passe?pagamento=ok')
    expect(body.back_urls.pending).toBe('https://onzemestre.com/fantasia/passe?pagamento=pendente')
    expect(body.notification_url).toBe('https://x.supabase.co/functions/v1/mercadopago-webhook')
  })
})

describe('passPayment', () => {
  const payment = {
    id: 9001,
    status: 'approved',
    external_reference: 'u1:3',
    transaction_amount: 5,
  }

  it('reads an approved payment', () => {
    expect(passPayment(payment)).toEqual({
      userId: 'u1',
      seasonId: 3,
      paymentId: '9001',
      amountCents: 500,
    })
  })

  it('ignores a payment still pending, refused or without a pass', () => {
    expect(passPayment({ ...payment, status: 'pending' })).toBeUndefined()
    expect(passPayment({ ...payment, status: 'rejected' })).toBeUndefined()
    expect(passPayment({ ...payment, external_reference: 'u1' })).toBeUndefined()
    expect(passPayment({ ...payment, external_reference: undefined })).toBeUndefined()
  })
})
