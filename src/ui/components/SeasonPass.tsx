import { useEffect, useState } from 'react'
import { CheckIcon, PlusIcon, TicketIcon } from 'lucide-react'
import { Link } from 'react-router'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { loadFantasySeason, type FantasySeason } from '../../cloud/fantasy.ts'
import { loadMyLeagues } from '../../cloud/leagues.ts'
import { buyPass, loadMyPasses, PASS_PRICE, type OwnedPass } from '../../cloud/pass.ts'
import { Note } from './FantasyParts.tsx'

/** Leagues one pass creates in its season (supabase/migrations). */
const LEAGUES_PER_PASS = 10

const paidOn = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' })

const money = (cents: number) =>
  (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

/** What the pass gives, as a list of checks. */
export function PassPerks(props: { year: number }) {
  return (
    <ul className="flex flex-col gap-2">
      {[
        `Crie até ${LEAGUES_PER_PASS} ligas privadas nesta temporada e chame quem quiser pelo link.`,
        'Seus amigos entram de graça. Num grupo, basta um ter o passe.',
        'Não dá pontos nem moedas a mais: o orçamento é igual para todo mundo.',
        `Vale até o fim da temporada ${props.year}.`,
      ].map((line) => (
        <li key={line} className="flex gap-2">
          <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
          {line}
        </li>
      ))}
    </ul>
  )
}

/** Sends the player to Mercado Pago's payment page for the running season's pass. */
export function BuyPassButton(props: { disabled?: boolean }) {
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
    <Button onClick={buy} disabled={opening || props.disabled}>
      <TicketIcon />
      Comprar passe
    </Button>
  )
}

const howPaid = (pass: OwnedPass) =>
  pass.provider === 'cortesia'
    ? `Cortesia, recebida em ${paidOn.format(pass.paidAt)}.`
    : `Comprado em ${paidOn.format(pass.paidAt)} por ${money(pass.amountCents)}.`

/** The account page's pass tab: this season's pass, or how to get it, and the passes of past seasons. */
export function PassPanel(props: { userId: string }) {
  const [season, setSeason] = useState<FantasySeason | null>()
  const [passes, setPasses] = useState<OwnedPass[]>()
  const [created, setCreated] = useState<number>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([loadFantasySeason(), loadMyPasses(props.userId)])
      .then(([loaded, owned]) => {
        if (!live) return
        setSeason(loaded ?? null)
        setPasses(owned)
      })
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [props.userId])

  const current = season ? passes?.find((pass) => pass.seasonId === season.id) : undefined
  const past = passes?.filter((pass) => pass !== current) ?? []

  // How many of the pass's leagues are used, once there is a pass to count them for.
  useEffect(() => {
    if (!current) return
    let live = true
    loadMyLeagues(current.seasonId)
      .then((leagues) => {
        if (live) setCreated(leagues.filter((l) => l.ownerId === props.userId).length)
      })
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [current, props.userId])

  if (failed) return <Note>Não deu para carregar o passe agora. Tente de novo mais tarde.</Note>
  if (season === undefined || passes === undefined) return <Note>Carregando…</Note>

  return (
    <div className="flex flex-col gap-4">
      {season === null ? (
        <Note>A temporada oficial ainda não começou. O passe aparece aqui quando ela abrir.</Note>
      ) : current ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-wrap items-center gap-2">
              <TicketIcon className="size-5" />
              Passe {season.year}
              <Badge>{season.status === 'em_andamento' ? 'Ativo' : 'Temporada encerrada'}</Badge>
            </CardTitle>
            <CardDescription>{howPaid(current)}</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-3 text-sm">
            {created !== undefined && (
              <p>
                Você criou {created} de {LEAGUES_PER_PASS} ligas nesta temporada.
              </p>
            )}
            {season.status === 'em_andamento' &&
              (created === undefined || created < LEAGUES_PER_PASS) && (
                <Button asChild size="sm" className="self-start">
                  <Link to="/fantasia#ligas">
                    <PlusIcon />
                    Criar uma liga
                  </Link>
                </Button>
              )}
          </CardContent>
        </Card>
      ) : season.status === 'em_andamento' ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <TicketIcon className="size-5" />
              Passe {season.year}
            </CardTitle>
            <CardDescription>
              Você ainda não tem o passe desta temporada. Jogar e entrar nas ligas dos amigos é
              grátis; o passe é para criar as suas.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-col gap-4 text-sm">
            <PassPerks year={season.year} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span>
                <strong className="text-base">{PASS_PRICE}</strong> por temporada, no Pix ou no
                cartão.
              </span>
              <BuyPassButton />
            </div>
          </CardContent>
        </Card>
      ) : (
        <Note>
          A temporada {season.year} acabou. O passe da próxima aparece aqui quando ela abrir.
        </Note>
      )}

      {past.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Temporadas anteriores</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {past.map((pass) => (
                <li key={pass.seasonId} className="rounded-md border px-2 py-1">
                  <span className="font-semibold">Passe {pass.year ?? ''}</span>
                  <span className="text-muted-foreground"> · {howPaid(pass)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <p className="text-center text-xs text-muted-foreground">
        <Link to="/fantasia/passe" className="underline underline-offset-2">
          Como funciona o passe
        </Link>
      </p>
    </div>
  )
}
