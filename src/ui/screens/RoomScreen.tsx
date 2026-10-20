import { useCallback, useEffect, useState } from 'react'
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
import {
  Note,
  RoomOptionsFields,
  RoomPage,
  TeamCrest,
  TeamFields,
} from '../components/RoomParts.tsx'
import { DraftView, QueueBeforeDraft } from '../components/Draft.tsx'
import { confirm } from '../confirm.ts'
import { usePackPool } from '../usePackPool.ts'
import {
  checkRoomDraft,
  describeOptions,
  formatDraftAt,
  fromLocalInput,
  roomInviteLink,
  STATUS_LABELS,
  toLocalInput,
  type RoomOptionsDraft,
} from '../room.ts'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

type Loaded = { room: Room; members: RoomMember[] }

/** A room's page. Before the draft, the waiting room: who is in, their teams, the invite and the options. */
export function RoomScreen() {
  const id = Number(useParams().id)
  const { ready, user } = useAccountStore()
  const [loaded, setLoaded] = useState<Loaded | null>()
  const [failed, setFailed] = useState(false)

  const reload = useCallback(
    () =>
      loadRoom(id)
        .then((found) => {
          setLoaded(found ?? null)
          setFailed(false)
        })
        .catch(() => setFailed(true)),
    [id],
  )

  useEffect(() => {
    if (!cloudEnabled || !ready || !user || !Number.isInteger(id)) return
    reload()
    // Until the room goes live (D3), coming back to the tab is when it catches up.
    const onFocus = () => document.visibilityState === 'visible' && reload()
    document.addEventListener('visibilitychange', onFocus)
    return () => document.removeEventListener('visibilitychange', onFocus)
  }, [id, ready, user, reload])

  return (
    <RoomPage title={loaded?.room.name ?? 'Sala'}>
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
        <RoomBody {...loaded} userId={user.id} reload={reload} />
      )}
    </RoomPage>
  )
}

type BodyProps = Loaded & { userId: string; reload: () => Promise<void> }

function RoomBody(props: BodyProps) {
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
  const pool = usePackPool(waiting ? room.pack : undefined)
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
          <CardDescription>
            {waiting
              ? `O draft está marcado para ${formatDraftAt(room.draftAt)}.`
              : 'O draft já começou.'}
          </CardDescription>
        </CardHeader>
        {waiting && (
          <CardContent className="flex flex-col gap-4">
            <Invite code={room.inviteCode} />
            {owner && (
              <Button className="self-start" onClick={start} disabled={starting}>
                <PlayIcon />
                Começar o draft agora
              </Button>
            )}
          </CardContent>
        )}
      </Card>

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
          <ul className="flex flex-col gap-1">
            {members.map((member) => (
              <li key={member.userId} className="flex items-center gap-2 rounded-md border p-2">
                <TeamCrest team={member} id={member.userId} className="size-8 shrink-0" />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="truncate font-medium">{member.name}</span>
                  <span className="truncate text-xs text-muted-foreground">
                    {member.shortName}
                    {member.nickname && ` · ${member.nickname}`}
                    {member.userId === userId && ' · você'}
                  </span>
                </span>
                {member.userId === room.ownerId && (
                  <CrownIcon className="size-4 text-muted-foreground" aria-label="Criou a sala" />
                )}
                {owner && waiting && member.userId !== userId && (
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Tirar ${member.name} da sala`}
                    onClick={() => remove(member)}
                  >
                    <XIcon />
                  </Button>
                )}
              </li>
            ))}
            {Array.from({ length: robots }, (_, i) => (
              <li
                key={`robo-${i}`}
                className="flex items-center gap-2 rounded-md border border-dashed p-2 text-sm text-muted-foreground"
              >
                <BotIcon className="size-8 shrink-0 p-1" />
                Vaga livre
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>

      {waiting && pool && <QueueBeforeDraft room={room} userId={userId} pool={pool} />}

      {me && waiting && (
        <MyTeam roomId={room.id} team={me} onSaved={props.reload} key={JSON.stringify(me)} />
      )}

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

      {(waiting || (owner && room.status === 'encerrada')) && (
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
  const initial: RoomOptionsDraft = {
    name: room.name,
    options: room.options,
    draftAt: toLocalInput(room.draftAt),
  }
  const [draft, setDraft] = useState(initial)
  const [busy, setBusy] = useState(false)
  const changed = JSON.stringify(draft) !== JSON.stringify(initial)

  const save = async () => {
    const problem = checkRoomDraft(draft, new Date(), room.createdAt)
    if (problem) {
      toast.error(problem)
      return
    }
    setBusy(true)
    try {
      await updateRoom(room.id, draft.name, draft.options, fromLocalInput(draft.draftAt)!)
      await props.onSaved()
      toast.success('Sala salva.')
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
        <RoomOptionsFields value={draft} onChange={setDraft} people={props.people} />
        <Button className="self-end" onClick={save} disabled={busy || !changed}>
          Salvar regras
        </Button>
      </CardContent>
    </Card>
  )
}
