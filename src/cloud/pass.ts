import { supabase } from './client.ts'
import { PASS_DAYS, PASS_PRICE_CENTS } from './mercadopago.ts'

export { PASS_DAYS }

/** What the pass costs, as the screen shows it. */
export const PASS_PRICE = (PASS_PRICE_CENTS / 100).toLocaleString('pt-BR', {
  style: 'currency',
  currency: 'BRL',
})

function client() {
  if (!supabase) throw new Error('O jogo online não está disponível nesta versão.')
  return supabase
}

/** The player's pass: when it ends, if it is running, and whether a payment arrived. */
export type PassStatus = { endsAt?: Date; paid: boolean }

/**
 * When the player's running pass ends (counting the days already bought
 * after it), and whether the payment `paymentId` was granted.
 */
export async function loadPass(userId: string, paymentId?: string): Promise<PassStatus> {
  const { data, error } = await client()
    .from('passes')
    .select('payment_id, provider, starts_at, ends_at')
    .eq('user_id', userId)
    .gt('ends_at', new Date().toISOString())
  if (error) throw error
  const rows = data as {
    payment_id: string
    provider: string
    starts_at: string
    ends_at: string
  }[]
  return { ...passStatus(rows, new Date()), paid: rows.some((r) => r.payment_id === paymentId) }
}

/**
 * When a pass made of these periods ends, if one is running now. Periods
 * bought while a pass runs start where it ends, so they chain on.
 */
export function passStatus(
  rows: readonly { starts_at: string; ends_at: string }[],
  now: Date,
): { endsAt?: Date } {
  const periods = rows
    .map((r) => ({ start: new Date(r.starts_at), end: new Date(r.ends_at) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime())
  let endsAt: Date | undefined
  for (const period of periods) {
    if (endsAt ? period.start <= endsAt : period.start <= now) {
      if (period.end > now && (!endsAt || period.end > endsAt)) endsAt = period.end
    }
  }
  return endsAt ? { endsAt } : {}
}

/** One payment of the pass, as the account page lists it. */
export type PassPayment = {
  provider: string
  paymentId: string
  amountCents: number
  startsAt: Date
  /** Missing for a lifetime pass. */
  endsAt?: Date
  state: 'running' | 'next' | 'over'
}

/** The player's pass history and the stretch that runs now, for the account page. */
export type PassHistory = {
  /** When the running pass ends; missing when none runs or it is for life. */
  endsAt?: Date
  /** When the running pass began, counting the periods chained before it. */
  since?: Date
  lifetime: boolean
  /** Whole days left, the day it ends counting as one. */
  daysLeft?: number
  /** Newest first. */
  payments: PassPayment[]
}

type PassRow = {
  provider: string
  payment_id: string
  amount_cents: number
  starts_at: string
  ends_at: string
}

const DAY_MS = 24 * 60 * 60 * 1000

/** A pass end as milliseconds; Postgres sends a lifetime pass as 'infinity'. */
const endTime = (end: string) => (end === 'infinity' ? Infinity : new Date(end).getTime())

/**
 * Every payment of the pass, with the stretch running at `now`: periods
 * bought while a pass runs start where it ends, so they chain on.
 */
export function passHistory(rows: readonly PassRow[], now: Date): PassHistory {
  const at = now.getTime()
  const periods = rows
    .map((r) => ({ row: r, start: new Date(r.starts_at).getTime(), end: endTime(r.ends_at) }))
    .sort((a, b) => a.start - b.start)

  let since: number | undefined
  let end: number | undefined
  for (const period of periods) {
    const chains = end !== undefined ? period.start <= end : period.start <= at
    if (!chains || period.end <= at) continue
    if (end === undefined) since = period.start
    end = Math.max(end ?? 0, period.end)
  }

  const payments = periods
    .map(({ row, start, end: stop }): PassPayment => ({
      provider: row.provider,
      paymentId: row.payment_id,
      amountCents: row.amount_cents,
      startsAt: new Date(start),
      endsAt: stop === Infinity ? undefined : new Date(stop),
      state: stop <= at ? 'over' : start <= at ? 'running' : 'next',
    }))
    .reverse()

  if (end === undefined) return { lifetime: false, payments }
  const lifetime = end === Infinity
  return {
    since: new Date(since!),
    lifetime,
    ...(lifetime ? {} : { endsAt: new Date(end), daysLeft: Math.ceil((end - at) / DAY_MS) }),
    payments,
  }
}

/** All the passes the player ever had, for the account page. */
export async function loadPassHistory(userId: string): Promise<PassHistory> {
  const { data, error } = await client()
    .from('passes')
    .select('provider, payment_id, amount_cents, starts_at, ends_at')
    .eq('user_id', userId)
  if (error) throw error
  return passHistory(data as PassRow[], new Date())
}

/** Opens Mercado Pago's payment page for 30 more days of pass. */
export async function buyPass(): Promise<void> {
  const { data, error } = await client().functions.invoke('pass')
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => undefined)
    throw new Error(body?.error ?? 'Não deu para abrir o pagamento agora. Tente de novo.')
  }
  location.assign(data.url)
}

/** Whether the signed-in player has a running pass, which creating a room needs. */
export async function hasPass(): Promise<boolean> {
  const { data, error } = await client().rpc('has_pass')
  if (error) throw error
  return data === true
}
