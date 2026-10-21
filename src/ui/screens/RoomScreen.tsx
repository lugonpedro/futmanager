import { useCallback, useEffect, useRef, useState } from 'react'
import { BotIcon, CopyIcon, CrownIcon, PlayIcon, RefreshCwIcon, XIcon } from 'lucide-react'
import { useNavigate, useParams } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cloudEnabled } from '../../cloud/client.ts'
import { startDraftNow, watchRoom } from '../../cloud/draft.ts'
import {
  deleteRoom,
  leaveRoom,
  loadRoom,
  saveRoomTeam,
  updateRoom,
  type Room,
  type RoomMember,
} from '../../cloud/rooms.ts'
import { checkTeamIdentity, type TeamIdentity } from '../../engine/room/team.ts'
import { useAccountStore } from '../../store/account.ts'
import { Note, RoomPage, RoomRulesFields, TeamCrest, TeamFields } from '../components/RoomParts.tsx'
import { DeleteRoomButton } from '../components/DeleteRoomButton.tsx'
import { DraftView } from '../components/Draft.tsx'
import { LeagueView } from '../components/League.tsx'
import { RoomNotices } from '../components/RoomNotices.tsx'
import { confirm } from '../confirm.ts'
import { describeOptions, formatDraftAt, roomInviteLink, STATUS_LABELS } from '../room.ts'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

type Loaded = { room: Room; members: RoomMember[] }

/** A room's page. Before the draft, the waiting room: who is in, their teams, the invite and the options. */
export function RoomScreen() {
  const params = useParams()
  const id = Number(params.id)
  const page = params.page
  const { ready, user } = useAccountStore()
  const [loaded, setLoaded] = useState<Loaded | null>()
  const [failed, setFailed] = useState(false)

  // Live updates come in bursts (robots pick many in a row); only the latest answer counts, so
  // a slow older one never takes the page back to an earlier pick.
  const latest = useRef(0)
  const reload = useCallback(() => {
    const asked = ++latest.current
    return loadRoom(id)
      .then((found) => {
        if (asked !== latest.current) return
        setLoaded(found ?? null)
        setFailed(false)
      })
      .catch(() => {
        if (asked === latest.current) setFailed(true)
      })
  }, [id])

  useEffect(() => {
    if (!cloudEnabled || !ready || !user || !Number.isInteger(id)) return
    reload()
    // Until the room goes live (D3), coming back to the tab is when it catches up.
    const onFocus = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [id, ready, user, reload])

  // Once the league starts, the room has its own frame with a page for each part.
  const status = loaded?.room.status
  if (user && loaded && (status === 'liga' || status === 'encerrada')) {
    return <LeagueView room={loaded.room} userId={user.id} reload={reload} page={page} />
  }

  return (
    <RoomPage title={loaded?.room.name ?? 'Sala'} wide={loaded?.room.status === 'draft'}>
      {!cloudEnabled ? (
        <Note>O jogo online não está disponível nesta versão.</Note>
      ) : ready && !user ? (
        <Note>Entre na sua conta para ver a sala.</Note>
      ) : failed ? (
        <Note>Não deu para carregar a sala agora. Tente de novo mais tarde.</Note>
      ) : loaded === null || !Number.isInteger(id) ? (
        <Note>Essa sala não existe ou você não está nela.</Note>
      ) : !loaded || !user ? (
        <Note>Carregando…</Note>
      ) : (
        <>
          <RoomBody {...loaded} userId={user.id} reload={reload} />
          <RoomNotices />
        </>
      )}
    </RoomPage>
  )
}

type BodyProps = Loaded & { userId: string; reload: () => Promise<void> }

function RoomBody(props: BodyProps) {
  const { room } = props
  return (
    <>
      <RoomView {...props} />
      {room.ownerId === props.userId && room.status === 'draft' && <DeleteRoomButton room={room} />}
    </>
  )
}

function RoomView(props: BodyProps) {
  const { room } = props
  if (room.status !== 'draft') return <WaitingRoom {...props} />
  if (!room.draft)
    return <Note>Preparando o draft: montando a lista de jogadores e sorteando a ordem…</Note>
  return <DraftView room={room} userId={props.userId} reload={props.reload} />
}

function WaitingRoom(props: BodyProps) {
  const { room, members, userId } = props
  const navigate = useNavigate()
  const owner = room.ownerId === userId
  const waiting = room.status === 'espera'
  const me = members.find((m) => m.userId === userId)
  const robots = Math.max(0, room.options.teams - members.length)
  const [starting, setStarting] = useState(false)

  // The owner starting the draft, or the time coming, turns this page into the draft.
  const { reload } = props
  useEffect(
    () =>
      waiting ? watchRoom(room.id, { pick: () => {}, room: reload, team: () => {} }) : undefined,
    [room.id, waiting, reload],
  )

  const start = async () => {
    const ok = await confirm({
      title: 'Começar o draft agora?',
      description:
        robots > 0
          ? `Ainda faltam ${robots} ${robots === 1 ? 'pessoa' : 'pessoas'}: ${robots === 1 ? 'a vaga vira robô' : 'as vagas viram robôs'}, e ninguém mais entra na sala.`
          : 'Ninguém mais entra na sala depois disso.',
      action: 'Começar o draft',
    })
    if (!ok) return
    setStarting(true)
    try {
      await startDraftNow(room.id)
      await props.reload()
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setStarting(false)
    }
  }

  const remove = async (member: RoomMember) => {
    const ok = await confirm({
      title: `Tirar ${member.name} da sala?`,
      description: 'A pessoa pode voltar com o convite enquanto o draft não começa.',
      action: 'Tirar da sala',
      destructive: true,
    })
    if (!ok) return
    try {
      await leaveRoom(room.id, member.userId)
      await props.reload()
    } catch (error) {
      toast.error(messageOf(error))
    }
  }

  const leave = async () => {
    const ok = await confirm({
      title: owner ? 'Apagar a sala?' : 'Sair da sala?',
      description: owner
        ? 'A sala some para todo mundo que entrou nela.'
        : 'Você pode voltar com o convite enquanto o draft não começa.',
      action: owner ? 'Apagar sala' : 'Sair da sala',
      destructive: true,
    })
    if (!ok) return
    try {
      if (owner) await deleteRoom(room.id)
      else await leaveRoom(room.id, userId)
      navigate('/salas')
    } catch (error) {
      toast.error(messageOf(error))
    }
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex flex-wrap items-center justify-between gap-2">
            {STATUS_LABELS[room.status]}
            <Button variant="ghost" size="sm" onClick={props.reload}>
              <RefreshCwIcon />
              Atualizar
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {waiting && <Invite code={room.inviteCode} />}
          <p className="text-sm">
            {waiting ? (
              <>
                O draft começará <strong>{formatDraftAt(room.draftAt)}</strong>.
              </>
            ) : (
              'O draft já começou.'
            )}
          </p>
          {owner && waiting && (
            <Button className="self-start" onClick={start} disabled={starting}>
              <PlayIcon />
              Começar o draft agora
            </Button>
          )}
        </CardContent>
      </Card>

      {me && waiting && (
        <MyTeam roomId={room.id} team={me} onSaved={props.reload} key={JSON.stringify(me)} />
      )}

      <Card>
        <CardHeader>
          <CardTitle>
            Times ({members.length} de {room.options.teams})
          </CardTitle>
          <CardDescription>
            {robots > 0
              ? `Faltam ${robots} ${robots === 1 ? 'pessoa' : 'pessoas'}. As vagas que ninguém pegar até o draft viram robôs, que escolhem e escalam sozinhos.`
              : 'A sala está completa.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="flex flex-wrap gap-x-2 gap-y-3">
            {members.map((member) => (
              <li
                key={member.userId}
                className="relative flex w-20 flex-col items-center gap-1 text-center"
                title={member.nickname ? `${member.name} · ${member.nickname}` : member.name}
              >
                <TeamCrest team={member} id={member.userId} className="size-12" />
                <span className="w-full truncate text-xs font-medium">{member.name}</span>
                <span className="-mt-1 w-full truncate text-[0.7rem] text-muted-foreground">
                  {member.userId === userId ? 'você' : (member.nickname ?? member.shortName)}
                </span>
                {member.userId === room.ownerId && (
                  <CrownIcon
                    className="absolute top-0 left-1 size-4 fill-highlight text-highlight"
                    aria-label="Criou a sala"
                  />
                )}
                {owner && waiting && member.userId !== userId && (
                  <Button
                    variant="secondary"
                    size="icon"
                    className="absolute -top-1 right-1 size-5 rounded-full"
                    aria-label={`Tirar ${member.name} da sala`}
                    onClick={() => remove(member)}
                  >
                    <XIcon className="size-3" />
                  </Button>
                )}
              </li>
            ))}
            {Array.from({ length: robots }, (_, i) => (
              <li
                key={`robo-${i}`}
                className="flex w-20 flex-col items-center gap-1 text-center text-xs text-muted-foreground"
              >
                <span className="flex size-12 items-center justify-center rounded-full border border-dashed">
                  <BotIcon className="size-6" />
                </span>
                Vaga livre
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {owner && waiting ? (
        <EditRoom room={room} people={members.length} onSaved={props.reload} />
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Regras</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
              {describeOptions(room.options).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {waiting && (
        <Button variant="outline" className="self-start" onClick={leave}>
          {owner ? 'Apagar sala' : 'Sair da sala'}
        </Button>
      )}
    </>
  )
}

function Invite(props: { code: string }) {
  const link = roomInviteLink(location.origin, props.code)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      toast.success('Link copiado. Mande para os amigos.')
    } catch {
      toast.error('Não deu para copiar. Selecione o link e copie à mão.')
    }
  }
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">Convite</span>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-md border bg-muted px-2 py-1.5 text-sm select-all">
          {link}
        </code>
        <Button variant="outline" size="sm" onClick={copy}>
          <CopyIcon />
          Copiar
        </Button>
      </div>
      <span className="text-xs text-muted-foreground">
        Código <strong className="font-mono">{props.code}</strong>. Entrar na sala é grátis.
      </span>
    </div>
  )
}

function MyTeam(props: { roomId: number; team: TeamIdentity; onSaved: () => Promise<void> }) {
  const [team, setTeam] = useState(props.team)
  const [busy, setBusy] = useState(false)
  const changed = JSON.stringify(team) !== JSON.stringify(props.team)

  const save = async () => {
    const problem = checkTeamIdentity(team)
    if (problem) {
      toast.error(problem)
      return
    }
    setBusy(true)
    try {
      await saveRoomTeam(props.roomId, team)
      await props.onSaved()
      toast.success('Time salvo.')
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Seu time</CardTitle>
        <CardDescription>Dá para mudar até o draft começar.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <TeamFields id="meu-time" value={team} onChange={setTeam} />
        <Button className="self-end" onClick={save} disabled={busy || !changed}>
          Salvar time
        </Button>
      </CardContent>
    </Card>
  )
}

function EditRoom(props: { room: Room; people: number; onSaved: () => Promise<void> }) {
  const { room } = props
  const [options, setOptions] = useState(room.options)
  const [busy, setBusy] = useState(false)
  const changed = JSON.stringify(options) !== JSON.stringify(room.options)

  const save = async () => {
    setBusy(true)
    try {
      // The name and the time of the draft stay as the room was created.
      await updateRoom(room.id, room.name, options, room.draftAt)
      await props.onSaved()
      toast.success('Regras salvas.')
    } catch (error) {
      toast.error(messageOf(error))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Regras</CardTitle>
        <CardDescription>
          Só você, que criou a sala, muda as regras, e só até o draft começar.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <RoomRulesFields value={options} onChange={setOptions} people={props.people} />
        <Button className="self-end" onClick={save} disabled={busy || !changed}>
          Salvar regras
        </Button>
      </CardContent>
    </Card>
  )
}
