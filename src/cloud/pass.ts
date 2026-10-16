import { supabase } from './client.ts'

/** What the season pass costs; the price itself is set in Stripe, keep both in step. */
export const PASS_PRICE = 'R$\u00a09,90'

function client() {
  if (!supabase) throw new Error('O jogo online não está disponível nesta versão.')
  return supabase
}

/** Whether the player has the pass of that season. */
export async function hasPass(userId: string, seasonId: number): Promise<boolean> {
  const { data, error } = await client()
    .from('fantasy_passes')
    .select('season_id')
    .eq('user_id', userId)
    .eq('season_id', seasonId)
    .maybeSingle()
  if (error) throw error
  return Boolean(data)
}

/** Opens Stripe's payment page for the pass of the running season. */
export async function buyPass(): Promise<void> {
  const { data, error } = await client().functions.invoke('fantasy-pass')
  if (error) {
    const body = await (error as { context?: Response }).context?.json?.().catch(() => undefined)
    throw new Error(body?.error ?? 'Não deu para abrir o pagamento agora. Tente de novo.')
  }
  location.assign(data.url)
}
