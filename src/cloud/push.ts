import { supabase } from './client.ts'
import { fromBase64Url } from './webpush.ts'

const vapidKey = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

/** Which notices this browser gets. */
export type PushPrefs = { market: boolean; rounds: boolean }

/**
 * Whether this browser can get the notices at all: 'sim'; 'instalar' on an
 * iPhone or iPad until the app is added to the home screen; 'nao' otherwise.
 */
export function pushSupport(): 'sim' | 'instalar' | 'nao' {
  if (!supabase || !vapidKey || !('serviceWorker' in navigator)) return 'nao'
  if ('PushManager' in window && 'Notification' in window) return 'sim'
  return /iPhone|iPad|iPod/.test(navigator.userAgent) ? 'instalar' : 'nao'
}

function client() {
  if (!supabase) throw new Error('O jogo online não está disponível nesta versão.')
  return supabase
}

/** The app's service worker; missing while developing, where none is registered. */
async function registration() {
  const found = await navigator.serviceWorker.getRegistration()
  if (!found) throw new Error('As notificações só funcionam no app publicado.')
  return navigator.serviceWorker.ready
}

/** This browser's subscription and its choices, if it is subscribed for the signed-in user. */
export async function loadPushPrefs(): Promise<PushPrefs | undefined> {
  const found = await navigator.serviceWorker.getRegistration()
  const subscription = await found?.pushManager.getSubscription()
  if (!subscription || Notification.permission !== 'granted') return undefined
  const { data, error } = await client()
    .from('push_subscriptions')
    .select('market, rounds')
    .eq('endpoint', subscription.endpoint)
    .maybeSingle()
  if (error) throw error
  return data ?? undefined
}

/** Asks for permission if needed, subscribes this browser and saves its choices. */
export async function savePushPrefs(prefs: PushPrefs): Promise<void> {
  if ((await Notification.requestPermission()) !== 'granted')
    throw new Error('O navegador não deixou mandar notificações.')
  const { pushManager } = await registration()
  const subscription =
    (await pushManager.getSubscription()) ??
    (await pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: fromBase64Url(vapidKey!),
    }))
  const { endpoint, keys } = subscription.toJSON()
  const { error } = await client().rpc('save_push_subscription', {
    sub_endpoint: endpoint,
    sub_p256dh: keys?.p256dh,
    sub_auth: keys?.auth,
    want_market: prefs.market,
    want_rounds: prefs.rounds,
  })
  if (error)
    throw new Error(
      error.hint === 'limite'
        ? 'Sua conta já recebe avisos em dez aparelhos. Desligue em algum deles primeiro.'
        : 'Não deu para ligar os avisos agora. Tente de novo.',
    )
}

/** Stops the notices on this browser. */
export async function disablePush(): Promise<void> {
  const found = await navigator.serviceWorker.getRegistration()
  const subscription = await found?.pushManager.getSubscription()
  if (!subscription) return
  const { error } = await client()
    .from('push_subscriptions')
    .delete()
    .eq('endpoint', subscription.endpoint)
  if (error) throw error
  await subscription.unsubscribe()
}
