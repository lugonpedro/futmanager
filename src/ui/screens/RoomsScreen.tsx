import { useEffect, useState, type FormEvent } from 'react'
import { ChevronRightIcon, PlusIcon, UsersIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cloudEnabled } from '../../cloud/client.ts'
import { createRoom, loadMyRooms, type Room } from '../../cloud/rooms.ts'
import { checkTeamIdentity, type TeamIdentity } from '../../engine/room/team.ts'
import { DEFAULT_ROOM_OPTIONS } from '../../engine/room/types.ts'
import { useAccountStore } from '../../store/account.ts'
import { RoomOptionsFields, RoomPage, Note, TeamFields } from '../components/RoomParts.tsx'
import {
  checkRoomDraft,
  formatDraftAt,
  fromLocalInput,
  readRoomInviteCode,
  STATUS_LABELS,
  suggestedDraftAt,
  toLocalInput,
  type RoomOptionsDraft,
} from '../room.ts'
import { signInLink } from '../signIn.ts'
import { useSuggestedTeam } from '../useSuggestedTeam.ts'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** The rooms the player is in, with ways to create one or join by code. */
export function RoomsScreen() {
  const { ready, user } = useAccountStore()
  return (
    <RoomPage title="Salas de draft" back="/">
      {!cloudEnabled ? (
        <Note>O jogo online não está disponível nesta versão.</Note>
      ) : !ready ? (
        <Note>Carregando…</Note>
      ) : !user ? (
        <Card>
          <CardContent className="flex flex-wrap items-center justify-between gap-3 text-sm">
            <span>
              Monte um time com os amigos num draft ao vivo e dispute uma liga entre vocês. Entre na
              sua conta para criar ou entrar numa sala.
            </span>
            <Button asChild size="sm">
              <Link to={signInLink('/salas')}>Entrar</Link>
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          <MyRooms />
          <JoinByCode />
          <NewRoom />
        </>
      )}
    </RoomPage>
  )
}

function MyRooms() {
  const [rooms, setRooms] = useState<Room[]>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    loadMyRooms()
      .then((loaded) => live && setRooms(loaded))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Suas salas</CardTitle>
        <CardDescription>
          Cada sala tem um draft ao vivo, em que cada jogador só pode ir para um time, e depois uma
          liga entre os times.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {failed ? (
          <p className="text-sm text-muted-foreground">Não deu para carregar as suas salas.</p>
        ) : rooms === undefined ? (
          <p className="text-sm text-muted-foreground">Carregando…</p>
        ) : rooms.length === 0 ? (
          <p className="text-sm text-muted-foreground">Você ainda não está em nenhuma sala.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {rooms.map((room) => (
              <li key={room.id}>
                <Link
                  to={`/sala/${room.id}`}
                  className="flex items-center gap-2 rounded-md border p-2 hover:bg-accent"
                >
                  <UsersIcon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate font-medium">{room.name}</span>
                    <span className="truncate text-xs text-muted-foreground">
                      {STATUS_LABELS[room.status]}
                      {room.status === 'espera' && `, draft ${formatDraftAt(room.draftAt)}`}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {room.members}/{room.options.teams}
                  </span>
                  <ChevronRightIcon className="size-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function JoinByCode() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const join = (event: FormEvent) => {
    event.preventDefault()
    const typed = readRoomInviteCode(code)
    if (typed) navigate(`/sala/convite/${typed}`)
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar numa sala</CardTitle>
        <CardDescription>Cole o link ou o código que um amigo mandou.</CardDescription>
      </CardHeader>
      <CardContent>
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

function NewRoom() {
  const navigate = useNavigate()
  const suggested = useSuggestedTeam()
  const [open, setOpen] = useState(false)
  // The suggestion follows the profile, which may load after the page, until the player edits it.
  const [edited, setTeam] = useState<TeamIdentity>()
  const team = edited ?? suggested
  const [draft, setDraft] = useState<RoomOptionsDraft>(() => ({
    name: '',
    options: DEFAULT_ROOM_OPTIONS,
    draftAt: toLocalInput(suggestedDraftAt(new Date())),
  }))
  const [busy, setBusy] = useState(false)

  const create = async (event: FormEvent) => {
    event.preventDefault()
    const problem = checkRoomDraft(draft, new Date()) ?? checkTeamIdentity(team)
    if (problem) {
      toast.error(problem)
      return
    }
    setBusy(true)
    try {
      const id = await createRoom(draft.name, draft.options, fromLocalInput(draft.draftAt)!, team)
      navigate(`/sala/${id}`)
    } catch (error) {
      toast.error(messageOf(error))
      setBusy(false)
    }
  }

  if (!open) {
    return (
      <Button onClick={() => setOpen(true)} className="self-start">
        <PlusIcon />
        Criar uma sala
      </Button>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Nova sala</CardTitle>
        <CardDescription>
          Escolha as regras e marque o draft. Depois é só mandar o convite; as vagas que ninguém
          pegar viram robôs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={create} className="flex flex-col gap-6">
          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Seu time</h2>
            <TeamFields id="novo-time" value={team} onChange={setTeam} />
          </section>
          <RoomOptionsFields value={draft} onChange={setDraft} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={busy}>
              Criar sala
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}
