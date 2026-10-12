import { useLiveQuery } from 'dexie-react-hooks'
import { DownloadIcon, PencilIcon, PlayIcon, Trash2Icon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  deleteSave,
  exportSave,
  listSaves,
  parseSaveFile,
  readSave,
  saveFileName,
  writeSave,
  type SaveInfo,
} from '../../db/saves.ts'
import { useGameStore } from '../../store/game.ts'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import { download } from '../download.ts'
import { formatDate } from '../format.ts'

const when = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

export function HomeScreen() {
  const saves = useLiveQuery(listSaves)
  const { openSave, closeGame, slotId } = useGameStore()
  const navigate = useNavigate()
  const fileInput = useRef<HTMLInputElement>(null)
  const [message, setMessage] = useState<string>()

  const open = async (id: string) => {
    if (await openSave(id)) navigate('/jogo')
  }

  const exportSlot = async (id: string) => {
    const game = await readSave(id)
    if (game) download(saveFileName(game), exportSave(game))
  }

  const remove = async (save: SaveInfo) => {
    if (!window.confirm(`Apagar a carreira com ${save.clubName}? Não dá para desfazer.`)) return
    if (save.id === slotId) closeGame()
    await deleteSave(save.id)
  }

  const importFile = async (file: File | undefined) => {
    if (!file) return
    try {
      const game = parseSaveFile(await file.text())
      await writeSave(game)
      setMessage(`Carreira com ${game.world.clubs[game.userClubId].name} importada.`)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : String(error))
    } finally {
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
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
                      <span className="truncate font-semibold">{save.clubName}</span>
                      <span className="text-xs text-muted-foreground">
                        {save.seasonOver
                          ? `${save.year}, fim da temporada`
                          : save.today
                            ? formatDate(save.today)
                            : `${save.year}, rodada ${save.round}`}{' '}
                        · salvo em {when.format(new Date(save.updatedAt))}
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
                    <Button
                      size="icon"
                      variant="ghost"
                      aria-label={`Exportar a carreira com ${save.clubName}`}
                      title="Exportar para um arquivo"
                      onClick={() => exportSlot(save.id)}
                    >
                      <DownloadIcon />
                    </Button>
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
          <Button variant="outline" onClick={() => fileInput.current?.click()}>
            <UploadIcon />
            Importar save
          </Button>
          <input
            ref={fileInput}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={(event) => importFile(event.target.files?.[0])}
          />
          {message && (
            <p role="status" className="text-center text-sm text-muted-foreground">
              {message}
            </p>
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
          <Link
            to="/aviso-legal"
            className="text-center text-xs text-muted-foreground underline-offset-2 hover:underline"
          >
            Aviso legal
          </Link>
        </CardContent>
      </Card>
    </main>
  )
}
