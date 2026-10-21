import { useEffect, useState } from 'react'
import { CheckIcon, PlusIcon, TicketIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cloudEnabled } from '../../cloud/client.ts'
import { buyPass, loadPass, PASS_DAYS, PASS_PRICE, type PassStatus } from '../../cloud/pass.ts'
import { useAccountStore } from '../../store/account.ts'
import { CONTACT_URL } from '../contact.ts'
import { Note, RoomPage } from '../components/RoomParts.tsx'
import { signInLink } from '../signIn.ts'

/** How often, and how many times, to look for the pass after paying. */
const POLL_MS = 3000
const POLLS = 20

const endsOn = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' })

/** The 30-day pass: what it gives, until when the player has it, and the way to pay. */
export function PassScreen() {
  const { ready, user } = useAccountStore()
  const [params] = useSearchParams()
  // Pix may come back still pending; both wait for the payment to show up.
  const paying = ['ok', 'pendente'].includes(params.get('pagamento') ?? '')
  // Mercado Pago adds the payment's id to the address it sends the player back to.
  const paymentId = params.get('payment_id') ?? undefined
  const [pass, setPass] = useState<PassStatus>()
  const [failed, setFailed] = useState(false)

  // Back from paying, the pass shows up once Mercado Pago tells the server; look a few times.
  useEffect(() => {
    if (!cloudEnabled || !user) return
    let live = true
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const look = () =>
      loadPass(user.id, paymentId)
        .then((found) => {
          if (!live) return
          setPass(found)
          const arrived = paymentId ? found.paid : !!found.endsAt
          if (paying && !arrived && ++tries < POLLS) timer = setTimeout(look, POLL_MS)
        })
        .catch(() => live && setFailed(true))
    void look()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [user, paying, paymentId])

  const waiting = paying && pass && !(paymentId ? pass.paid : pass.endsAt)

  return (
    <RoomPage title="Passe" back="/salas">
      {!cloudEnabled ? (
        <Note>O jogo online não está disponível nesta versão.</Note>
      ) : failed ? (
        <Note>Não deu para carregar o passe agora. Tente de novo mais tarde.</Note>
      ) : !ready || (user && !pass) ? (
        <Note>Carregando…</Note>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TicketIcon className="size-5" />
              Passe de {PASS_DAYS} dias
            </CardTitle>
            <CardDescription>
              Entrar nas salas dos amigos é grátis. O passe é para quem quer criar salas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <PassPerks />

            {!user ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>Entre na sua conta para comprar o passe.</span>
                <Button asChild size="sm">
                  <Link to={signInLink('/passe')}>Entrar</Link>
                </Button>
              </div>
            ) : (
              <>
                {pass?.endsAt && (
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-highlight-soft p-3">
                    <span className="font-medium">
                      Seu passe vale até {endsOn.format(pass.endsAt)}.
                    </span>
                    <Button asChild size="sm">
                      <Link to="/salas">
                        <PlusIcon />
                        Criar uma sala
                      </Link>
                    </Button>
                  </div>
                )}
                {waiting ? (
                  <p role="status" className="rounded-md border p-3">
                    Pagamento enviado. O passe aparece aqui assim que o pagamento for confirmado; no
                    Pix isso pode levar alguns minutos.
                  </p>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <span>
                      <strong className="text-base">{PASS_PRICE}</strong> por {PASS_DAYS} dias, no
                      Pix ou no cartão.
                      {pass?.endsAt && ' Os dias novos começam quando o passe atual acabar.'}
                    </span>
                    <BuyPassButton renew={!!pass?.endsAt} />
                  </div>
                )}
              </>
            )}

            <p className="text-xs text-muted-foreground">
              O pagamento é feito na página do Mercado Pago; o jogo nunca vê os dados do seu cartão.
              O passe não renova sozinho. Para pedir reembolso,{' '}
              <a href={CONTACT_URL} className="underline underline-offset-2">
                fale com a gente
              </a>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </RoomPage>
  )
}

/** What the pass gives, as a list of checks. */
function PassPerks() {
  return (
    <ul className="flex flex-col gap-2">
      {[
        `Crie salas de draft durante ${PASS_DAYS} dias e chame quem quiser pelo link.`,
        'Seus amigos entram de graça. Numa sala, basta quem criou ter o passe.',
        'A sala criada vai até o fim, mesmo que o passe acabe antes.',
        'Não dá vantagem no jogo: todo mundo escolhe e joga com as mesmas regras.',
      ].map((line) => (
        <li key={line} className="flex gap-2">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          {line}
        </li>
      ))}
    </ul>
  )
}

/** Sends the player to Mercado Pago's payment page. */
function BuyPassButton(props: { renew: boolean }) {
  const [opening, setOpening] = useState(false)
  const buy = async () => {
    setOpening(true)
    try {
      await buyPass()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setOpening(false)
    }
  }
  return (
    <Button onClick={buy} disabled={opening} variant={props.renew ? 'outline' : 'default'}>
      <TicketIcon />
      {props.renew ? `Comprar mais ${PASS_DAYS} dias` : 'Comprar passe'}
    </Button>
  )
}
