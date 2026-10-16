import { CloudIcon, LogOutIcon, MailIcon, RefreshCwIcon, Trash2Icon } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { cloudEnabled } from '../../cloud/client.ts'
import { FREE_CLOUD_SLOTS } from '../../cloud/sync.ts'
import {
  deleteAccount,
  saveProfile,
  sendMagicLink,
  signInWithGoogle,
  signOut,
  syncNow,
  useAccountStore,
  type Profile,
} from '../../store/account.ts'
import { ConflictDialog } from '../components/ConflictDialog.tsx'
import { ManagerCrest } from '../components/ManagerCrest.tsx'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import { MANAGER_CREST_COLORS } from '../manager.ts'
import { confirm } from '../confirm.ts'
import { toast } from 'sonner'

const syncTime = new Intl.DateTimeFormat('pt-BR', { timeStyle: 'short' })

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Signing in, the manager's profile, cloud saves and deleting the account. */
export function AccountScreen() {
  const { ready, user } = useAccountStore()
  return (
    <main className="mx-auto flex max-w-xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Conta</h1>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Voltar</Link>
          </Button>
        </div>
      </header>
      {!cloudEnabled ? (
        <Card>
          <CardContent className="text-sm leading-relaxed">
            Contas ainda não estão disponíveis nesta versão do jogo. Suas carreiras continuam salvas
            neste aparelho.
          </CardContent>
        </Card>
      ) : !ready ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : user ? (
        <>
          <ProfileCard />
          <CloudCard />
          <AccountCard email={user.email} />
          <ConflictDialog />
        </>
      ) : (
        <SignInCard />
      )}
      <Link
        to="/privacidade"
        className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
      >
        Privacidade e dados
      </Link>
    </main>
  )
}

function SignInCard() {
  const [email, setEmail] = useState('')
  const [sentTo, setSentTo] = useState<string>()
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await sendMagicLink(email.trim())
      setSentTo(email.trim())
    } catch (e) {
      setError(messageOf(e))
    } finally {
      setBusy(false)
    }
  }

  const google = async () => {
    setError(undefined)
    try {
      await signInWithGoogle()
    } catch (e) {
      setError(messageOf(e))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Entrar</CardTitle>
        <CardDescription>
          A conta é opcional. Com ela suas carreiras ficam guardadas na nuvem e você continua em
          outro aparelho. Sem senha: você entra por um link no e-mail ou com o Google.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {sentTo ? (
          <p role="status" className="rounded-md border p-3 text-sm leading-relaxed">
            Enviamos um link para <strong>{sentTo}</strong>. Abra o e-mail neste mesmo navegador
            para entrar.{' '}
            <button
              type="button"
              className="cursor-pointer underline underline-offset-2"
              onClick={() => setSentTo(undefined)}
            >
              Usar outro e-mail
            </button>
          </p>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-2">
            <Label htmlFor="email">E-mail</Label>
            <Input
              id="email"
              type="email"
              required
              autoComplete="email"
              placeholder="voce@exemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <Button type="submit" disabled={busy}>
              <MailIcon />
              Enviar link de acesso
            </Button>
          </form>
        )}
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          ou
          <span className="h-px flex-1 bg-border" />
        </div>
        <Button variant="outline" onClick={google}>
          Entrar com Google
        </Button>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ProfileCard() {
  const stored = useAccountStore((s) => s.profile)
  const isDefault = useAccountStore((s) => s.profileIsDefault)
  const [draft, setDraft] = useState<Profile>()
  const [message, setMessage] = useState<string>()
  const profile = draft ?? stored
  if (!profile) return null
  const nickname = profile.nickname.trim()
  const changed = isDefault || draft !== undefined

  const save = async (event: FormEvent) => {
    event.preventDefault()
    try {
      await saveProfile({ ...profile, nickname })
      setDraft(undefined)
      setMessage(undefined)
      toast.success('Perfil salvo.')
    } catch (e) {
      setMessage(messageOf(e))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Perfil</CardTitle>
        <CardDescription>Como você aparece para os amigos nas ligas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={save} className="flex flex-col gap-3">
          <div className="flex items-center gap-3">
            <ManagerCrest
              crest={profile.crest}
              nickname={nickname || '?'}
              className="size-14 shrink-0"
            />
            <div className="flex flex-1 flex-col gap-1">
              <Label htmlFor="nickname">Apelido</Label>
              <Input
                id="nickname"
                required
                maxLength={24}
                value={profile.nickname}
                onChange={(e) => {
                  setMessage(undefined)
                  setDraft({ ...profile, nickname: e.target.value })
                }}
              />
            </div>
          </div>
          <fieldset className="flex flex-col gap-1">
            <legend className="mb-1 text-sm font-medium">Escudo</legend>
            <div className="grid grid-cols-6 gap-1">
              {MANAGER_CREST_COLORS.map((_, crest) => (
                <button
                  key={crest}
                  type="button"
                  aria-label={`Escudo ${crest + 1}`}
                  aria-pressed={profile.crest === crest}
                  onClick={() => {
                    setMessage(undefined)
                    setDraft({ ...profile, crest })
                  }}
                  className={cn(
                    'flex cursor-pointer justify-center rounded-md border p-1 hover:bg-accent',
                    profile.crest === crest && 'border-primary ring-2 ring-primary',
                  )}
                >
                  <ManagerCrest crest={crest} nickname={nickname || '?'} className="size-9" />
                </button>
              ))}
            </div>
          </fieldset>
          <div className="flex items-center gap-2">
            <Button type="submit" disabled={!changed || !nickname}>
              Salvar perfil
            </Button>
            {message && (
              <span role="status" className="text-sm text-muted-foreground">
                {message}
              </span>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

function CloudCard() {
  const { status, lastSyncAt, notes, cloud, cloudSlots } = useAccountStore()
  useEffect(() => {
    void syncNow()
  }, [])
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CloudIcon className="size-5" />
          Save na nuvem
        </CardTitle>
        <CardDescription>
          {cloudSlots > FREE_CLOUD_SLOTS
            ? `Sua conta guarda até ${cloudSlots} carreiras na nuvem.`
            : 'Sua conta grátis guarda uma carreira na nuvem.'}{' '}
          Ela é salva enquanto você joga e aparece em qualquer aparelho em que você entrar.{' '}
          <Link to="/nuvem" className="underline underline-offset-2">
            Como funciona
          </Link>
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2 text-sm">
        <p role="status" className="text-muted-foreground">
          {status === 'syncing'
            ? 'Sincronizando…'
            : status === 'error'
              ? 'Não deu para sincronizar agora.'
              : lastSyncAt
                ? `Tudo sincronizado às ${syncTime.format(lastSyncAt)}.`
                : 'Ainda não sincronizado.'}
        </p>
        {cloud.length > 0 && (
          <ul className="flex flex-col gap-1">
            {cloud.map((save) => (
              <li key={save.id} className="rounded-md border px-2 py-1">
                Na nuvem: <span className="font-semibold">{save.club_name}</span>
              </li>
            ))}
          </ul>
        )}
        {notes.map((note) => (
          <p key={note} className="text-amber-700 dark:text-amber-400">
            {note}
          </p>
        ))}
        <Button
          variant="outline"
          className="self-start"
          disabled={status === 'syncing'}
          onClick={async () => {
            await syncNow()
            if (useAccountStore.getState().status === 'idle') toast.success('Tudo sincronizado.')
          }}
        >
          <RefreshCwIcon />
          Sincronizar agora
        </Button>
      </CardContent>
    </Card>
  )
}

function AccountCard(props: { email?: string }) {
  const navigate = useNavigate()
  const [error, setError] = useState<string>()

  const remove = async () => {
    const ok = await confirm({
      title: 'Apagar conta',
      description:
        'O perfil e todas as carreiras salvas na nuvem serão apagados para sempre. As carreiras deste aparelho continuam aqui.',
      action: 'Apagar conta',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteAccount()
      navigate('/')
    } catch (e) {
      setError(messageOf(e))
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conta</CardTitle>
        <CardDescription>Entrou como {props.email}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => signOut()}>
            <LogOutIcon />
            Sair
          </Button>
          <Button variant="destructive" onClick={remove}>
            <Trash2Icon />
            Apagar conta e dados
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Ao sair, as carreiras continuam neste aparelho.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </CardContent>
    </Card>
  )
}
