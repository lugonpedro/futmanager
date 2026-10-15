import { createClient, type SupabaseClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined

/**
 * The connection to the account server, or undefined in builds without one:
 * the game then runs as before, offline and without accounts.
 */
export const supabase: SupabaseClient | undefined =
  url && key ? createClient(url, key, { auth: { flowType: 'pkce' } }) : undefined

export const cloudEnabled = supabase !== undefined
