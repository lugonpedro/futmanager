import { useEffect, useState, type FormEvent } from 'react'
import { ChevronRightIcon, PlusIcon, TicketIcon, UsersIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { createLeague, loadMyLeagues, type FantasyLeague } from '../../cloud/leagues.ts'
import { hasPass, PASS_PRICE } from '../../cloud/pass.ts'
import { useAccountStore } from '../../store/account.ts'
import { readInviteCode } from '../fantasyLeague.ts'

/** The player's private leagues for the season, with ways to create one or join by code. */
export function FantasyLeagues(props: { seasonId: number; running: boolean }) {
  const navigate = useNavigate()
  const [leagues, setLeagues] = useState<FantasyLeague[]>()
  const [failed, setFailed] = useState(false)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const userId = useAccountStore((s) => s.user?.id)
  const [pass, setPass] = useState<boolean>()

  useEffect(() => {
    let live = true
    loadMyLeagues(props.seasonId)
      .then((loaded) => live && setLeagues(loaded))
      .catch(() => live && setFailed(true))
    if (userId)
      hasPass(userId, props.seasonId)
        .then((owned) => live && setPass(owned))
        .catch(() => live && setPass(false))
    return () => {
      live = false
    }
  }, [props.seasonId, userId])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    try {
      const id = await createLeague(name)
      navigate(`/fantasia/liga/${id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setBusy(false)
    }
  }

  const join = (event: FormEvent) => {
    event.preventDefault()
    const typed = readInviteCode(code)
    if (typed) navigate(`/fantasia/convite/${typed}`)
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Ligas</CardTitle>
        <CardDescription>
          Jogue contra os amigos: crie uma liga e mande o convite, ou entre com o código de alguém.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {failed ? (
          <p className="text-sm text-muted-foreground">Não deu para carregar as suas ligas.</p>
        ) : leagues === undefined ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : leagues.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não está em nenhuma liga.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {leagues.map((league) => (
              <li key={league.id}>
                <Link
                  to={`/fantasia/liga/${league.id}`}
                  className="flex items-center gap-2 rounded-md border p-2 hover:bg-accent"
                >
                  <UsersIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1 truncate font-medium">{league.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {league.members} {league.members === 1 ? 'pessoa' : 'pessoas'}
                  </span>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}

        {props.running && pass === false && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-dashed p-3 text-sm">
            <span>
              Criar liga exige o passe da temporada ({PASS_PRICE}). Entrar nas ligas dos amigos
              continua grátis.
            </span>
            <Button asChild size="sm">
              <Link to="/fantasia/passe">
                <TicketIcon />
                Ver o passe
              </Link>
            </Button>
          </div>
        )}
        {props.running && pass && (
          <form onSubmit={create} className="flex flex-wrap gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Nome da nova liga"
              aria-label="Nome da nova liga"
              maxLength={40}
              className="min-w-40 flex-1"
            />
            <Button type="submit" disabled={busy || name.trim().length < 3}>
              <PlusIcon />
              Criar liga
            </Button>
          </form>
        )}
        <form onSubmit={join} className="flex flex-wrap gap-2">
          <Input
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="Código ou link do convite"
            aria-label="Código ou link do convite"
            className="min-w-40 flex-1"
          />
          <Button type="submit" variant="outline" disabled={!code.trim()}>
            Entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  )
}
