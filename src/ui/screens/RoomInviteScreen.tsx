import { useEffect, useState } from 'react'
import { UsersIcon } from 'lucide-react'
import { Link, Navigate, useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cloudEnabled } from '../../cloud/client.ts'
import { joinRoom, loadInvite, type RoomInvite } from '../../cloud/rooms.ts'
import { checkTeamIdentity, type TeamIdentity } from '../../engine/room/team.ts'
import { useAccountStore } from '../../store/account.ts'
import { Note, RoomPage, TeamFields } from '../components/RoomParts.tsx'
import { formatDraftAt, readRoomInviteCode } from '../room.ts'
import { signInLink } from '../signIn.ts'
import { useSuggestedTeam } from '../useSuggestedTeam.ts'

/** Where an invite link lands: which room it is, and the team to join it with. */
export function RoomInviteScreen() {
  const code = readRoomInviteCode(useParams().code ?? '')
  const { ready, user } = useAccountStore()
  const [invite, setInvite] = useState<RoomInvite | null>()
  const [failed, setFailed] = useState(false)

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

  if (invite?.joined) return <Navigate to={`/sala/${invite.roomId}`} replace />

  return (
    <RoomPage title="Convite para sala">
      {!cloudEnabled ? (
        <Note>O jogo online não está disponível nesta versão.</Note>
      ) : ready && !user ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              Entre na sua conta para aceitar o convite. Depois de entrar, você volta para cá.
            </span>
            <Button asChild size="sm">
              <Link to={signInLink(`/sala/convite/${code}`)}>Entrar</Link>
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
        <Join code={code} invite={invite} />
      )}
    </RoomPage>
  )
}

function Join(props: { code: string; invite: RoomInvite }) {
  const { invite } = props
  const navigate = useNavigate()
  const suggested = useSuggestedTeam()
  // The suggestion follows the profile, which may load after the page, until the player edits it.
  const [edited, setTeam] = useState<TeamIdentity>()
  const team = edited ?? suggested
  const [joining, setJoining] = useState(false)
  const full = invite.members >= invite.teams
  const started = invite.status !== 'espera'

  const join = async () => {
    const problem = checkTeamIdentity(team)
    if (problem) {
      toast.error(problem)
      return
    }
    setJoining(true)
    try {
      navigate(`/sala/${await joinRoom(props.code, team)}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
      setJoining(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UsersIcon className="size-5" />
          {invite.name}
        </CardTitle>
        <CardDescription>
          {invite.ownerNickname ? `Sala criada por ${invite.ownerNickname}` : 'Sala de draft'}, com{' '}
          {invite.members} de {invite.teams} times.{' '}
          {!started && `O draft está marcado para ${formatDraftAt(invite.draftAt)}.`}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        {started ? (
          <p className="text-sm text-muted-foreground">
            O draft dessa sala já começou; não dá mais para entrar.
          </p>
        ) : full ? (
          <p className="text-sm text-muted-foreground">Essa sala já está cheia.</p>
        ) : (
          <>
            <p className="text-sm">
              Dê nome, sigla e cores ao seu time. Dá para mudar até o draft.
            </p>
            <TeamFields id="time-convite" value={team} onChange={setTeam} />
            <Button className="self-end" onClick={join} disabled={joining}>
              Entrar na sala
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  )
}
