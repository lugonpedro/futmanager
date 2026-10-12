import { useLiveQuery } from 'dexie-react-hooks'
import {
  CloudCheckIcon,
  CloudIcon,
  CloudUploadIcon,
  PencilIcon,
  PlayIcon,
  Trash2Icon,
  UserIcon,
} from 'lucide-react'
import { useEffect } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { cloudEnabled } from '../../cloud/client.ts'
import { db, deleteSave, listSaves, type SaveInfo } from '../../db/saves.ts'
import { moveCareerToCloud, syncNow, useAccountStore } from '../../store/account.ts'
import { useGameStore } from '../../store/game.ts'
import { ConflictDialog } from '../components/ConflictDialog.tsx'
import { ManagerCrest } from '../components/ManagerCrest.tsx'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import { formatSavedAt, slotProgress } from '../format.ts'

export function HomeScreen() {
  const saves = useLiveQuery(listSaves)
  const { openSave, closeGame, slotId } = useGameStore()
  const navigate = useNavigate()
  const { user, cloud, cloudSlots, status } = useAccountStore()
  const synced = useLiveQuery(() => db.synced.toArray())
  const inCloud = (save: SaveInfo) =>
    synced?.some((base) => base.id === save.id && base.userId === user?.id && !base.deleted)

  useEffect(() => {
    void syncNow()
  }, [user?.id])

  const open = async (id: string) => {
    if (await openSave(id)) navigate('/jogo')
  }

  const remove = async (save: SaveInfo) => {
    if (!window.confirm(`Apagar a carreira com ${save.clubName}? Não dá para desfazer.`)) return
    if (save.id === slotId) closeGame()
    await deleteSave(save.id)
    void syncNow()
  }

  const toCloud = async (save: SaveInfo) => {
    const full = cloud.length >= cloudSlots
    // The career that has waited longest in the cloud gives up its place.
    const replaced = full ? [...cloud].sort((a, b) => a.updated_at - b.updated_at)[0] : undefined
    const question = replaced
      ? `A nuvem da sua conta guarda ${cloudSlots === 1 ? 'uma carreira' : `${cloudSlots} carreiras`}. Levar a carreira com ${save.clubName} para a nuvem no lugar da carreira com ${replaced.club_name}? Ela sai da nuvem e dos outros aparelhos, mas continua neste.`
      : `Levar a carreira com ${save.clubName} para a nuvem?`
    if (window.confirm(question)) await moveCareerToCloud(save.id, replaced?.id)
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
      {cloudEnabled && (
        <div className="absolute top-3 left-3">
          <AccountButton />
        </div>
      )}
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-md">
        <CardContent className="flex flex-col items-stretch gap-4">
          <div className="text-center">
            <h1 className="text-4xl font-bold">futmanager</h1>
            <p className="text-muted-foreground">Gerencie seu time rumo à primeira divisão.</p>
          </div>

          {saves && saves.length > 0 && (
            <section className="flex flex-col gap-2">
              <h2 className="text-sm font-semibold text-muted-foreground">Suas carreiras</h2>
              <ul className="flex flex-col gap-2">
                {saves.map((save) => (
                  <li key={save.id} className="flex items-center gap-1 rounded-md border p-2">
                    <button
                      type="button"
                      onClick={() => open(save.id)}
                      className="flex min-w-0 flex-1 cursor-pointer flex-col rounded px-1 text-left hover:bg-accent"
                    >
                      <span className="flex items-center gap-1 font-semibold">
                        <span className="truncate">{save.clubName}</span>
                        {inCloud(save) && (
                          <CloudCheckIcon
                            className="size-4 shrink-0 text-muted-foreground"
                            aria-label="Salva na nuvem"
                          />
                        )}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {slotProgress(save)} · salvo em {formatSavedAt(save.updatedAt)}
                        {user && status !== 'syncing' && !inCloud(save) && ' · só neste aparelho'}
                      </span>
                    </button>
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Continuar com ${save.clubName}`}
                      onClick={() => open(save.id)}
                    >
                      <PlayIcon />
                    </Button>
                    {user && status !== 'syncing' && !inCloud(save) && (
                      <Button
                        size="icon"
                        variant="ghost"
                        aria-label={`Levar a carreira com ${save.clubName} para a nuvem`}
                        title="Levar para a nuvem"
                        onClick={() => toCloud(save)}
                      >
                        <CloudUploadIcon />
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Apagar a carreira com ${save.clubName}`}
                      title="Apagar"
                      onClick={() => remove(save)}
                    >
                      <Trash2Icon />
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <Button asChild size="lg">
            <Link to="/novo">Novo jogo</Link>
          </Button>
          {cloudEnabled && (
            <Button asChild variant="outline">
              <Link to="/nuvem">
                <CloudIcon />
                Jogar em vários aparelhos
              </Link>
            </Button>
          )}
          <Button asChild variant="outline">
            <Link to="/editor">
              <PencilIcon />
              Editor de times
            </Link>
          </Button>
          <Button asChild variant="link">
            <Link to="/amistoso">Jogar um amistoso</Link>
          </Button>
          <nav className="flex justify-center gap-4 text-xs text-muted-foreground">
            <Link to="/aviso-legal" className="underline-offset-2 hover:underline">
              Aviso legal
            </Link>
            <Link to="/privacidade" className="underline-offset-2 hover:underline">
              Privacidade
            </Link>
          </nav>
        </CardContent>
      </Card>
      <ConflictDialog />
    </main>
  )
}

/** "Entrar" while signed out; the manager's crest and nickname once signed in. */
function AccountButton() {
  const { ready, user, profile } = useAccountStore()
  if (!ready) return null
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to="/conta">
        {user && profile ? (
          <>
            <ManagerCrest crest={profile.crest} nickname={profile.nickname} className="size-5" />
            <span className="max-w-32 truncate">{profile.nickname}</span>
          </>
        ) : (
          <>
            <UserIcon />
            Entrar
          </>
        )}
      </Link>
    </Button>
  )
}
