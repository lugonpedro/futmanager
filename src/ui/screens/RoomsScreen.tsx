import { useEffect, useState, type FormEvent } from 'react'
import { ChevronDownIcon, ChevronRightIcon, PlusIcon, TicketIcon, UsersIcon } from 'lucide-react'
import { Link, useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { cloudEnabled } from '../../cloud/client.ts'
import { hasPass, PASS_PRICE } from '../../cloud/pass.ts'
import { createRoom, loadMyRooms, PASS_NEEDED, type Room } from '../../cloud/rooms.ts'
import { checkTeamIdentity } from '../../engine/room/team.ts'
import { DEFAULT_ROOM_OPTIONS } from '../../engine/room/types.ts'
import { useAccountStore } from '../../store/account.ts'
import { Pager } from '../components/Pager.tsx'
import { RoomBasicsFields, RoomPage, Note } from '../components/RoomParts.tsx'
import {
  checkRoomDraft,
  readRoomInviteCode,
  STATUS_LABELS,
  type RoomOptionsDraft,
} from '../room.ts'
import { signInLink } from '../signIn.ts'
import { usePage } from '../usePage.ts'
import { useSuggestedTeam } from '../useSuggestedTeam.ts'

/** Ended rooms shown at a time, under their toggle. */
const ENDED_PAGE = 5

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
          <NewRoom />
          <JoinByCode />
          <MyRooms />
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

  const going = rooms?.filter((room) => room.status !== 'encerrada') ?? []
  const ended = rooms?.filter((room) => room.status === 'encerrada') ?? []

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
          <div className="flex flex-col gap-3">
            {going.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma sala em andamento.</p>
            ) : (
              <RoomList rooms={going} />
            )}
            {ended.length > 0 && <EndedRooms rooms={ended} />}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function RoomList(props: { rooms: Room[] }) {
  return (
    <ul className="flex flex-col gap-1">
      {props.rooms.map((room) => (
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
  )
}

/** The ended rooms, closed until opened, five at a time. */
function EndedRooms(props: { rooms: Room[] }) {
  const [open, setOpen] = useState(false)
  const paged = usePage(props.rooms, ENDED_PAGE)
  return (
    <section className="flex flex-col gap-2">
      <button
        type="button"
        className="flex items-center justify-between gap-2 rounded-md px-1 py-1 text-left text-sm font-medium hover:bg-accent"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Encerradas ({props.rooms.length})
        <ChevronDownIcon
          className={cn('size-4 text-muted-foreground transition-transform', open && 'rotate-180')}
        />
      </button>
      {open && (
        <>
          <RoomList rooms={paged.items} />
          <Pager paged={paged} />
        </>
      )}
    </section>
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
  // The team starts from the profile; its name and colours change in the waiting room.
  const team = useSuggestedTeam()
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState<RoomOptionsDraft>(() => ({
    name: '',
    options: DEFAULT_ROOM_OPTIONS,
  }))
  const [busy, setBusy] = useState(false)
  // Creating needs a running pass; unknown until the server answers, or if it can't.
  const [pass, setPass] = useState<boolean>()

  useEffect(() => {
    let live = true
    hasPass()
      .then((found) => live && setPass(found))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [])

  const create = async (event: FormEvent) => {
    event.preventDefault()
    const problem = checkRoomDraft(draft) ?? checkTeamIdentity(team)
    if (problem) {
      toast.error(problem)
      return
    }
    setBusy(true)
    try {
      const id = await createRoom(draft.name, draft.options, team)
      navigate(`/sala/${id}`)
    } catch (error) {
      if (messageOf(error) === PASS_NEEDED) {
        setPass(false)
        setOpen(false)
      } else toast.error(messageOf(error))
      setBusy(false)
    }
  }

  if (pass === false) return <PassNeeded />

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
          Dê um nome e escolha quantos times. O seu time e as outras regras dá para mudar depois, na
          sala de espera. Depois é só mandar o convite; as vagas que ninguém pegar viram robôs.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={create} className="flex flex-col gap-6">
          <RoomBasicsFields value={draft} onChange={setDraft} />
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

/** Instead of the form, for someone without a running pass. */
function PassNeeded() {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <TicketIcon className="size-5" />
          Criar uma sala
        </CardTitle>
        <CardDescription>
          Para criar uma sala você precisa do passe de 30 dias, por {PASS_PRICE}. Entrar nas salas
          dos amigos continua grátis.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Button asChild size="sm">
          <Link to="/passe">
            <TicketIcon />
            Ver o passe
          </Link>
        </Button>
      </CardContent>
    </Card>
  )
}
