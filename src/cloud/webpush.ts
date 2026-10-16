// Sending Web Push notifications with nothing but WebCrypto, so the same code
// runs in the browser's tests and in the Supabase functions (Deno). The
// message is encrypted for the subscribed browser (RFC 8291, aes128gcm) and
// the request is signed with the app's VAPID key (RFC 8292).

/** A browser's push subscription, as `PushSubscription.toJSON()` gives it. */
export type PushTarget = { endpoint: string; p256dh: string; auth: string }

/** The app's VAPID key pair, in the base64url form `web-push generate-vapid-keys` prints. */
export type VapidKeys = { publicKey: string; privateKey: string; subject: string }

const encoder = new TextEncoder()

export function fromBase64Url(text: string): Uint8Array<ArrayBuffer> {
  const base64 = text.replace(/-/g, '+').replace(/_/g, '/')
  const binary = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4))
  return Uint8Array.from(binary, (c) => c.charCodeAt(0))
}

export function toBase64Url(bytes: Uint8Array): string {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function concat(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const part of parts) {
    out.set(part, at)
    at += part.length
  }
  return out
}

/** A P-256 key from its raw public point (65 bytes) and, for a private key, its secret `d`. */
function p256Jwk(publicKey: Uint8Array, d?: string): JsonWebKey {
  return {
    kty: 'EC',
    crv: 'P-256',
    x: toBase64Url(publicKey.slice(1, 33)),
    y: toBase64Url(publicKey.slice(33, 65)),
    ...(d && { d }),
    ext: true,
  }
}

async function hkdf(
  salt: Uint8Array<ArrayBuffer>,
  ikm: Uint8Array<ArrayBuffer>,
  info: Uint8Array<ArrayBuffer>,
  bytes: number,
) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'HKDF', hash: 'SHA-256', salt, info },
    key,
    bytes * 8,
  )
  return new Uint8Array(bits)
}

/** The sender's one-time key pair and salt; fixed only in tests. */
export type EncryptionSecrets = {
  salt: Uint8Array<ArrayBuffer>
  publicKey: Uint8Array<ArrayBuffer>
  privateKey: CryptoKey
}

async function freshSecrets(): Promise<EncryptionSecrets> {
  const pair = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, [
    'deriveBits',
  ])
  const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', pair.publicKey))
  return {
    salt: crypto.getRandomValues(new Uint8Array(16)),
    publicKey,
    privateKey: pair.privateKey,
  }
}

/** Imports a sender key pair given in base64url, for the RFC's test vector. */
export async function importSecrets(salt: string, publicKey: string, privateKey: string) {
  const raw = fromBase64Url(publicKey)
  const key = await crypto.subtle.importKey(
    'jwk',
    p256Jwk(raw, privateKey),
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    ['deriveBits'],
  )
  return { salt: fromBase64Url(salt), publicKey: raw, privateKey: key }
}

/** The encrypted body for one subscription: a single aes128gcm record. */
export async function encryptPayload(
  payload: Uint8Array,
  target: Pick<PushTarget, 'p256dh' | 'auth'>,
  secrets?: EncryptionSecrets,
): Promise<Uint8Array<ArrayBuffer>> {
  const { salt, publicKey, privateKey } = secrets ?? (await freshSecrets())
  const receiver = fromBase64Url(target.p256dh)
  const receiverKey = await crypto.subtle.importKey(
    'raw',
    receiver,
    { name: 'ECDH', namedCurve: 'P-256' },
    false,
    [],
  )
  const shared = new Uint8Array(
    await crypto.subtle.deriveBits({ name: 'ECDH', public: receiverKey }, privateKey, 256),
  )
  const ikm = await hkdf(
    fromBase64Url(target.auth),
    shared,
    concat(encoder.encode('WebPush: info\0'), receiver, publicKey),
    32,
  )
  const cek = await hkdf(salt, ikm, encoder.encode('Content-Encoding: aes128gcm\0'), 16)
  const nonce = await hkdf(salt, ikm, encoder.encode('Content-Encoding: nonce\0'), 12)
  const aes = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt'])
  // The 2 marks the last (and only) record, with no padding after it.
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce },
    aes,
    concat(payload, Uint8Array.of(2)),
  )
  const recordSize = new Uint8Array(4)
  new DataView(recordSize.buffer).setUint32(0, 4096)
  return concat(
    salt,
    recordSize,
    Uint8Array.of(publicKey.length),
    publicKey,
    new Uint8Array(sealed),
  )
}

/** The `Authorization` header for a push service: a JWT signed with the VAPID key. */
export async function vapidAuthorization(
  endpoint: string,
  keys: VapidKeys,
  nowSeconds: number,
): Promise<string> {
  const publicKey = fromBase64Url(keys.publicKey)
  const signer = await crypto.subtle.importKey(
    'jwk',
    p256Jwk(publicKey, keys.privateKey),
    { name: 'ECDSA', namedCurve: 'P-256' },
    false,
    ['sign'],
  )
  const part = (value: object) => toBase64Url(encoder.encode(JSON.stringify(value)))
  const unsigned = `${part({ typ: 'JWT', alg: 'ES256' })}.${part({
    aud: new URL(endpoint).origin,
    exp: nowSeconds + 12 * 3600,
    sub: keys.subject,
  })}`
  // WebCrypto signs ECDSA as r || s, which is what a JWT wants.
  const signature = await crypto.subtle.sign(
    { name: 'ECDSA', hash: 'SHA-256' },
    signer,
    encoder.encode(unsigned),
  )
  return `vapid t=${unsigned}.${toBase64Url(new Uint8Array(signature))}, k=${keys.publicKey}`
}

/** What happened to one notification: sent, or the subscription is gone and can be forgotten. */
export type PushOutcome = 'enviado' | 'expirado' | 'falhou'

/** Sends one notification. A day old is too late for any of the game's notices. */
export async function sendPush(
  target: PushTarget,
  message: unknown,
  keys: VapidKeys,
  topic?: string,
): Promise<PushOutcome> {
  const body = await encryptPayload(encoder.encode(JSON.stringify(message)), target)
  const response = await fetch(target.endpoint, {
    method: 'POST',
    headers: {
      Authorization: await vapidAuthorization(target.endpoint, keys, Math.floor(Date.now() / 1000)),
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      TTL: String(24 * 3600),
      Urgency: 'normal',
      ...(topic && { Topic: topic }),
    },
    body,
  })
  await response.body?.cancel()
  if (response.ok) return 'enviado'
  return response.status === 404 || response.status === 410 ? 'expirado' : 'falhou'
}
