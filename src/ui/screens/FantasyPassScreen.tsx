import { useEffect, useState } from 'react'
import { TicketIcon } from 'lucide-react'
import { Link, useSearchParams } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cloudEnabled } from '../../cloud/client.ts'
import { loadFantasySeason, type FantasySeason } from '../../cloud/fantasy.ts'
import { hasPass, PASS_PRICE } from '../../cloud/pass.ts'
import { useAccountStore } from '../../store/account.ts'
import { CONTACT_URL } from '../contact.ts'
import { Note } from '../components/FantasyParts.tsx'
import { BuyPassButton, PassPerks } from '../components/SeasonPass.tsx'
import { signInLink } from '../signIn.ts'
import { Page } from './FantasyLeagueScreen.tsx'

/** How often, and how many times, to look for the pass after paying. */
const POLL_MS = 3000
const POLLS = 20

/** The season pass: what it gives, and the way to Mercado Pago's payment page. */
export function FantasyPassScreen() {
  const { ready, user } = useAccountStore()
  const [params] = useSearchParams()
  // Pix may come back still pending; both wait for the pass to show up.
  const paying = ['ok', 'pendente'].includes(params.get('pagamento') ?? '')
  const [season, setSeason] = useState<FantasySeason | null>()
  const [owned, setOwned] = useState<boolean>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!cloudEnabled) return
    let live = true
    loadFantasySeason()
      .then((loaded) => live && setSeason(loaded ?? null))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  // Back from paying, the pass shows up once Mercado Pago tells the server; look a few times.
  useEffect(() => {
    if (!season || !user) return
    let live = true
    let tries = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    const look = () =>
      hasPass(user.id, season.id)
        .then((found) => {
          if (!live) return
          setOwned(found)
          if (!found && paying && ++tries < POLLS) timer = setTimeout(look, POLL_MS)
        })
        .catch(() => live && setFailed(true))
    void look()
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [season, user, paying])

  return (
    <Page title="Passe da temporada">
      {!cloudEnabled ? (
        <Note>O jogo online não está disponível nesta versão.</Note>
      ) : failed ? (
        <Note>Não deu para carregar o passe agora. Tente de novo mais tarde.</Note>
      ) : season === null ? (
        <Note>A temporada oficial ainda não começou. O passe aparece aqui quando ela abrir.</Note>
      ) : !season || !ready ? (
        <Note>Carregando…</Note>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TicketIcon className="size-5" />
              Brasileirão oficial {season.year}
            </CardTitle>
            <CardDescription>
              Jogar e entrar nas ligas dos amigos é grátis. O passe é para quem quer criar ligas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <PassPerks year={season.year} />

            {!user ? (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>Entre na sua conta para comprar o passe.</span>
                <Button asChild size="sm">
                  <Link to={signInLink('/fantasia/passe')}>Entrar</Link>
                </Button>
              </div>
            ) : owned ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-highlight-soft p-3">
                <span className="flex flex-col gap-0.5">
                  <span className="font-medium">Você tem o passe da temporada {season.year}.</span>
                  <Link to="/conta/passe" className="text-xs underline underline-offset-2">
                    Ver no seu perfil
                  </Link>
                </span>
                <Button asChild size="sm">
                  <Link to="/fantasia#ligas">Criar uma liga</Link>
                </Button>
              </div>
            ) : season.status !== 'em_andamento' ? (
              <p className="rounded-md border p-3">
                A temporada {season.year} acabou. O passe da próxima aparece aqui quando ela abrir.
              </p>
            ) : paying ? (
              <p role="status" className="rounded-md border p-3">
                Pagamento enviado. O passe aparece aqui assim que o pagamento for confirmado; no Pix
                isso pode levar alguns minutos.
              </p>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-3">
                <span>
                  <strong className="text-base">{PASS_PRICE}</strong> por temporada, no Pix ou no
                  cartão.
                </span>
                <BuyPassButton disabled={owned === undefined} />
              </div>
            )}

            <p className="text-xs text-muted-foreground">
              O pagamento é feito na página do Mercado Pago; o jogo nunca vê os dados do seu cartão.
              Para pedir reembolso,{' '}
              <a href={CONTACT_URL} className="underline underline-offset-2">
                fale com a gente
              </a>
              .
            </p>
          </CardContent>
        </Card>
      )}
    </Page>
  )
}
