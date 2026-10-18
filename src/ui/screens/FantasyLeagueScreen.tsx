import { useEffect, useState, type ReactNode } from 'react'
import { ArrowLeftIcon, CopyIcon, LogOutIcon, Trash2Icon } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { cloudEnabled } from '../../cloud/client.ts'
import { leaveLeague, loadLeague, type FantasyLeague, type Standing } from '../../cloud/leagues.ts'
import { useAccountStore } from '../../store/account.ts'
import { confirm } from '../confirm.ts'
import { Note } from '../components/FantasyParts.tsx'
import { ManagerCrest } from '../components/ManagerCrest.tsx'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import { inviteLink, places } from '../fantasyLeague.ts'
import { tenths } from '../format.ts'

/** A private league: the invite to share and the standings of its season. */
export function FantasyLeagueScreen() {
  const id = Number(useParams().id)
  const { ready, user } = useAccountStore()
  const [loaded, setLoaded] = useState<{ league: FantasyLeague; standings: Standing[] } | null>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    if (!cloudEnabled || !ready || !user || !Number.isInteger(id)) return
    let live = true
    loadLeague(id)
      .then((result) => live && setLoaded(result ?? null))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [id, ready, user])

  if (ready && (!user || !Number.isInteger(id) || loaded === null))
    return <Navigate to="/fantasia" replace />

  return (
    <Page title={loaded?.league.name ?? 'Liga'}>
      {!cloudEnabled ? (
        <Note>O jogo online não está disponível nesta versão.</Note>
      ) : failed ? (
        <Note>Não deu para carregar a liga agora. Tente de novo mais tarde.</Note>
      ) : !loaded || !user ? (
        <Note>Carregando…</Note>
      ) : (
        <League league={loaded.league} standings={loaded.standings} userId={user.id} />
      )}
    </Page>
  )
}

/** The frame the league and invite screens share. */
export function Page(props: { title: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Voltar à fantasia">
            <Link to="/fantasia">
              <ArrowLeftIcon />
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-bold">{props.title}</h1>
        </div>
        <ThemeToggle />
      </header>
      {props.children}
    </main>
  )
}

function League(props: { league: FantasyLeague; standings: Standing[]; userId: string }) {
  const { league, standings } = props
  const navigate = useNavigate()
  const link = inviteLink(location.origin, league.inviteCode)
  const owner = league.ownerId === props.userId
  const ranks = places(standings.map((s) => s.total))

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link do convite copiado.')
    } catch {
      toast.error('Não deu para copiar. Selecione o link e copie à mão.')
    }
  }

  const leave = async () => {
    const ok = await confirm(
      owner
        ? {
            title: 'Apagar a liga?',
            description: `A liga ${league.name} some para todo mundo que está nela. Os times e os pontos de cada um continuam.`,
            action: 'Apagar liga',
            destructive: true,
          }
        : {
            title: 'Sair da liga?',
            description: `Você sai de ${league.name}. Para voltar, vai precisar do convite de novo.`,
            action: 'Sair da liga',
          },
    )
    if (!ok) return
    try {
      await leaveLeague(league, props.userId)
      navigate('/fantasia')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Classificação</CardTitle>
          <CardDescription>
            Pontos somados em todas as rodadas jogadas da temporada.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="w-8 py-1 text-left font-normal">#</th>
                <th className="py-1 text-left font-normal">Técnico</th>
                <th className="py-1 text-right font-normal">Rodada</th>
                <th className="py-1 text-right font-normal">Total</th>
              </tr>
            </thead>
            <tbody>
              {standings.map((s, i) => {
                const nickname = s.nickname ?? 'Sem apelido'
                return (
                  <tr
                    key={s.userId}
                    className={cn('border-t', s.userId === props.userId && 'bg-highlight-soft')}
                  >
                    <td className="py-2 tabular-nums">{ranks[i]}º</td>
                    <td className="py-2">
                      <span className="flex min-w-0 items-center gap-2">
                        <ManagerCrest crest={s.crest} nickname={nickname} className="size-6" />
                        <span className="truncate font-medium">{nickname}</span>
                      </span>
                    </td>
                    <td className="py-2 text-right text-muted-foreground tabular-nums">
                      {tenths.format(s.last)}
                    </td>
                    <td className="py-2 text-right font-semibold tabular-nums">
                      {tenths.format(s.total)}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Convite</CardTitle>
          <CardDescription>
            Mande o link para quem você quer na liga. O código é {league.inviteCode}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Input
            readOnly
            value={link}
            aria-label="Link do convite"
            onFocus={(e) => e.target.select()}
            className="min-w-48 flex-1"
          />
          <Button onClick={copy}>
            <CopyIcon />
            Copiar link
          </Button>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        {owner ? (
          <span />
        ) : (
          <Link to="/fantasia#ligas" className="text-sm underline underline-offset-2">
            Criar a sua própria liga
          </Link>
        )}
        <Button variant="ghost" onClick={leave}>
          {owner ? <Trash2Icon /> : <LogOutIcon />}
          {owner ? 'Apagar liga' : 'Sair da liga'}
        </Button>
      </div>
    </>
  )
}
