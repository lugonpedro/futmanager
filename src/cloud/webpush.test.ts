import { describe, expect, it } from 'vitest'
import {
  encryptPayload,
  fromBase64Url,
  importSecrets,
  toBase64Url,
  vapidAuthorization,
} from './webpush.ts'

// The example in RFC 8291, section 5.
const RFC = {
  plaintext: 'When I grow up, I want to be a watermelon',
  senderPublic:
    'BP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A8',
  senderPrivate: 'yfWPiYE-n46HLnH0KqZOF1fJJU3MYrct3AELtAQ-oRw',
  receiverPublic:
    'BCVxsr7N_eNgVRqvHtD0zTZsEc6-VV-JvLexhqUzORcxaOzi6-AYWXvTBHm4bjyPjs7Vd8pZGH6SRpkNtoIAiw4',
  salt: 'DGv6ra1nlYgDCS1FRnbzlw',
  auth: 'BTBZMqHH6r4Tts7J_aSIgg',
  body: 'DGv6ra1nlYgDCS1FRnbzlwAAEABBBP4z9KsN6nGRTbVYI_c7VJSPQTBtkgcy27mlmlMoZIIgDll6e3vCYLocInmYWAmS6TlzAC8wEqKK6PBru3jl7A_yl95bQpu6cVPTpK4Mqgkf1CXztLVBSt2Ks3oZwbuwXPXLWyouBWLVWGNWQexSgSxsj_Qulcy4a-fN',
}

describe('base64url', () => {
  it('round-trips bytes without padding', () => {
    const bytes = Uint8Array.from({ length: 33 }, (_, i) => i * 7)
    expect(fromBase64Url(toBase64Url(bytes))).toEqual(bytes)
    expect(toBase64Url(bytes)).not.toMatch(/[+/=]/)
  })
})

describe('encryptPayload', () => {
  it('matches the RFC 8291 example', async () => {
    const secrets = await importSecrets(RFC.salt, RFC.senderPublic, RFC.senderPrivate)
    const body = await encryptPayload(
      new TextEncoder().encode(RFC.plaintext),
      { p256dh: RFC.receiverPublic, auth: RFC.auth },
      secrets,
    )
    expect(toBase64Url(body)).toBe(RFC.body)
  })

  it('uses a new key and salt for every message', async () => {
    const target = { p256dh: RFC.receiverPublic, auth: RFC.auth }
    const payload = new TextEncoder().encode('oi')
    const [a, b] = await Promise.all([
      encryptPayload(payload, target),
      encryptPayload(payload, target),
    ])
    expect(a.slice(0, 16)).not.toEqual(b.slice(0, 16))
    expect(a[20]).toBe(65)
    expect(a.slice(21, 86)).not.toEqual(b.slice(21, 86))
  })
})

describe('vapidAuthorization', () => {
  it('signs a JWT for the push service that the public key verifies', async () => {
    const pair = await crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, [
      'sign',
      'verify',
    ])
    const publicKey = toBase64Url(
      new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey)),
    )
    const { d } = await crypto.subtle.exportKey('jwk', pair.privateKey)
    const header = await vapidAuthorization(
      'https://fcm.googleapis.com/fcm/send/abc',
      { publicKey, privateKey: d!, subject: 'mailto:oi@exemplo.com' },
      1_000,
    )

    const [, token, key] = /^vapid t=(.+), k=(.+)$/.exec(header)!
    expect(key).toBe(publicKey)
    const [head, claims, signature] = token.split('.')
    expect(JSON.parse(new TextDecoder().decode(fromBase64Url(claims)))).toEqual({
      aud: 'https://fcm.googleapis.com',
      exp: 1_000 + 12 * 3600,
      sub: 'mailto:oi@exemplo.com',
    })
    const valid = await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      pair.publicKey,
      fromBase64Url(signature),
      new TextEncoder().encode(`${head}.${claims}`),
    )
    expect(valid).toBe(true)
  })
})
