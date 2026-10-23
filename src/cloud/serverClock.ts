import { supabase } from './client.ts'

/** How far the server's clock is ahead of the device's, in ms; 0 until measured. */
let offset = 0
let measuring: Promise<void> | undefined

/** Now by the server's clock, in ms since the epoch: the device's clock, corrected. */
export const serverNow = () => Date.now() + offset

/**
 * Measures the server's clock against the device's, once per visit: a few
 * calls, keeping the one with the shortest round trip, and the server's time
 * taken as halfway through it. Without the server, the device's clock stays.
 */
export function syncServerClock(): Promise<void> {
  measuring ??= measure().catch(() => {
    measuring = undefined
  })
  return measuring
}

async function measure() {
  if (!supabase) return
  let best: { trip: number; offset: number } | undefined
  for (let i = 0; i < 3; i++) {
    const sent = Date.now()
    const { data, error } = await supabase.rpc('server_now')
    const back = Date.now()
    if (error) throw error
    const sample = {
      trip: back - sent,
      offset: new Date(data as string).getTime() - (sent + back) / 2,
    }
    if (!best || sample.trip < best.trip) best = sample
  }
  if (best) offset = best.offset
}
