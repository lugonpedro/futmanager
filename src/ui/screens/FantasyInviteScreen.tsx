import { useEffect, useState } from 'react'
import { UsersIcon } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cloudEnabled } from '../../cloud/client.ts'
import { joinLeague, loadInvite, type LeagueInvite } from '../../cloud/leagues.ts'
import { useAccountStore } from '../../store/account.ts'
import { Note } from '../components/FantasyParts.tsx'
import { readInviteCode } from '../fantasyLeague.ts'
import { Page } from './FantasyLeagueScreen.tsx'

/** Where an invite link lands: which league it is, and a button to join it. */
export function FantasyInviteScreen() {
  const code = readInviteCode(useParams().code ?? '')
  const { ready, user } = useAccountStore()
  const navigate = useNavigate()
  const [invite, setInvite] = useState<LeagueInvite | null>()
  const [failed, setFailed] = useState(false)
  const [joining, setJoining] = useState(false)

  useEffect(() => {
    if (!cloudEnabled || !ready || !user) return
    let live = true
    loadInvite(code)
      .then((found) => live && setInvite(found ?? null))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [code, ready, user])

  if (invite?.joined) return <Navigate to={`/fantasia/liga/${invite.leagueId}`} replace />

  const join = async () => {
    setJoining(true)
    try {
      navigate(`/fantasia/liga/${await joinLeague(code)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setJoining(false)
    }
  }

  return (
    <Page title="Convite para liga">
      {!cloudEnabled ? (
        <Note>O jogo online não está disponível nesta versão.</Note>
      ) : ready && !user ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              Entre na sua conta para aceitar o convite. Depois, abra o link de novo ou digite o
              código {code} na tela da fantasia.
            </span>
            <Button asChild size="sm">
              <Link to="/conta">Entrar</Link>
            </Button>
          </CardContent>
        </Card>
      ) : failed ? (
        <Note>Não deu para carregar o convite agora. Tente de novo mais tarde.</Note>
      ) : invite === null ? (
        <Note>Esse convite não existe. Confira o código com quem mandou.</Note>
      ) : !invite ? (
        <Note>Carregando…</Note>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UsersIcon className="size-5" />
              {invite.name}
            </CardTitle>
            <CardDescription>
              {invite.ownerNickname ? `Liga criada por ${invite.ownerNickname}` : 'Liga privada'},
              com {invite.members} {invite.members === 1 ? 'pessoa' : 'pessoas'}.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex justify-end">
            <Button onClick={join} disabled={joining}>
              Entrar na liga
            </Button>
          </CardContent>
        </Card>
      )}
    </Page>
  )
}
