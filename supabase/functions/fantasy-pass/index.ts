// Opens a Mercado Pago Checkout Pro page for the pass of the running season and
// answers with its address; the browser goes there to pay. The pass itself is
// only granted by mercadopago-webhook, once the payment is approved.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { passPreference } from '../../../src/cloud/mercadopago.ts'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: auth } = await asUser.auth.getUser()
  if (!auth.user) return json({ error: 'Entre na sua conta para comprar o passe.' }, 401)

  const db = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
    auth: { persistSession: false },
  })
  try {
    const { data: season, error } = await db
      .from('fantasy_seasons')
      .select('id')
      .eq('status', 'em_andamento')
      .maybeSingle()
    if (error) throw error
    if (!season) return json({ error: 'A temporada oficial ainda não começou.' }, 409)
    const { data: owned, error: passError } = await db
      .from('fantasy_passes')
      .select('season_id')
      .eq('user_id', auth.user.id)
      .eq('season_id', season.id)
      .maybeSingle()
    if (passError) throw passError
    if (owned) return json({ error: 'Você já tem o passe desta temporada.' }, 409)

    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        passPreference({
          userId: auth.user.id,
          seasonId: season.id,
          email: auth.user.email,
          siteUrl: Deno.env.get('SITE_URL')!,
          notificationUrl: `${url}/functions/v1/mercadopago-webhook`,
        }),
      ),
    })
    const preference = await response.json()
    if (!response.ok) throw new Error(preference?.message ?? `Mercado Pago ${response.status}`)
    return json({ url: preference.init_point })
  } catch (error) {
    console.error(error)
    return json({ error: 'Não deu para abrir o pagamento agora. Tente de novo.' }, 500)
  }
})
