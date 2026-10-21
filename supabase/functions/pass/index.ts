// Opens a Mercado Pago Checkout Pro page for the 30-day pass and answers with
// its address; the browser goes there to pay. The pass itself is only granted
// by mercadopago-webhook, once the payment is approved, and a payment made
// while a pass is running adds its days after the end of that one.
import { createClient } from 'npm:@supabase/supabase-js@2'
import { passPreference } from '../../../src/cloud/mercadopago.ts'
import { CORS, json } from '../_shared/roomState.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  const url = Deno.env.get('SUPABASE_URL')!
  const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
    auth: { persistSession: false },
  })
  const { data: auth } = await asUser.auth.getUser()
  if (!auth.user) return json({ error: 'Entre na sua conta para comprar o passe.' }, 401)

  try {
    const response = await fetch('https://api.mercadopago.com/checkout/preferences', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${Deno.env.get('MP_ACCESS_TOKEN')}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(
        passPreference({
          userId: auth.user.id,
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
