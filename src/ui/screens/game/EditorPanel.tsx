import { DownloadIcon, RotateCcwIcon, SaveIcon } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { GameState } from '../../../engine/model/types.ts'
import { packFileName, packToJson } from '../../../engine/pack/file.ts'
import {
  applyPack,
  PACK_LIMITS,
  packFromWorld,
  packSlots,
  restoreGeneratedNames,
  squadOrder,
} from '../../../engine/pack/pack.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { ClubCrest } from '../../components/ClubCrest.tsx'
import {
  ClubFieldsForm,
  PackFileButton,
  PackLegalNote,
  PackMessage,
  type ClubFields,
} from '../../components/PackControls.tsx'
import { download } from '../../download.ts'
import { divisionName } from '../../format.ts'
import { usePackMessage } from '../../usePackMessage.ts'
import { confirm } from '../../confirm.ts'
import { confirmReplace } from '../../usePackMessage.ts'
import { toast } from 'sonner'

function originText(game: GameState): string {
  const { pack, edited } = game.names
  const source = pack ? `do pacote "${pack || 'sem nome'}"` : 'gerados pelo jogo'
  return `Nomes ${source}${edited ? ', com mudanças feitas no editor' : ''}.`
}

/**
 * Renaming during a career: club names, short names, cities and colours and
 * player names. Skills stay as they are, so the career keeps its balance.
 */
export function EditorPanel() {
  const game = useGame()
  const setGame = useGameStore((s) => s.setGame)
  const { world } = game
  const [clubId, setClubId] = useState(game.userClubId)
  // Bumped when a pack or the generated names replace everything, so the form starts afresh.
  const [revision, setRevision] = useState(0)
  const message = usePackMessage()

  const save = (next: GameState, text: string, reset = false) => {
    setGame(next)
    message.show(text)
    if (reset) setRevision((r) => r + 1)
  }

  const exportPack = () => {
    const pack = packFromWorld(world, game.names.pack ?? `Carreira ${game.season.year}`)
    download(packFileName(pack, 'json'), packToJson(pack))
    toast.success('Pacote da carreira exportado.')
  }

  const restore = async () => {
    const ok = await confirm({
      title: 'Voltar aos nomes gerados',
      description: 'Voltar todos os clubes e jogadores aos nomes gerados pelo jogo?',
      action: 'Voltar',
    })
    if (!ok) return
    save(
      { ...game, world: restoreGeneratedNames(world), names: {} },
      'Nomes gerados de volta.',
      true,
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-3">
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm">{originText(game)}</p>
          <p className="text-xs text-muted-foreground">
            Numa carreira em andamento dá para mudar nomes, siglas, cidades e cores. Idade, posição
            e overall só mudam num novo jogo, no editor do menu principal, para não mexer no
            equilíbrio da temporada.
          </p>
          <div className="flex flex-wrap gap-2">
            <PackFileButton
              size="sm"
              onLoad={async ({ pack, warnings }) => {
                const label = pack.name || 'sem nome'
                if (
                  !(await confirmReplace(`Trocar os nomes da carreira pelos do pacote "${label}"?`))
                ) {
                  return
                }
                const { world: renamed, report } = applyPack(world, pack, 'names')
                setGame({ ...game, world: renamed, names: { pack: pack.name } })
                setRevision((r) => r + 1)
                message.show(
                  `Pacote "${label}" aplicado: ${report.clubs} clubes e ${report.players} jogadores renomeados.`,
                  warnings.concat(report.warnings),
                )
              }}
              onError={message.fail}
            >
              Importar pacote (só nomes)
            </PackFileButton>
            <Button variant="outline" size="sm" onClick={exportPack}>
              <DownloadIcon />
              Exportar pacote
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={restore}
              disabled={!game.names.pack && !game.names.edited}
            >
              <RotateCcwIcon />
              Voltar aos nomes gerados
            </Button>
          </div>
          <PackMessage warnings={message.warnings} />
          <PackLegalNote />
        </CardContent>
      </Card>

      <Select value={clubId} onValueChange={setClubId}>
        <SelectTrigger className="w-full sm:w-96" aria-label="Clube">
          <SelectValue />
        </SelectTrigger>
        <SelectContent className="max-h-80">
          {packSlots(world).map((club) => (
            <SelectItem key={club.id} value={club.id}>
              {club.name} ({divisionName(club.division)})
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <ClubEditor
        key={`${clubId}-${revision}`}
        game={game}
        clubId={clubId}
        onSave={(next) => save(next, 'Mudanças salvas.')}
      />
    </div>
  )
}

/** The form for one club, kept apart so switching clubs starts it afresh. */
function ClubEditor(props: { game: GameState; clubId: string; onSave: (game: GameState) => void }) {
  const { game } = props
  const { world } = game
  const club = world.clubs[props.clubId]
  const squad = squadOrder(world, club)
  const [fields, setFields] = useState<ClubFields>({
    name: club.name,
    shortName: club.shortName,
    city: club.city,
  })
  const [names, setNames] = useState(() => Object.fromEntries(squad.map((p) => [p.id, p.name])))
  const tidy = (text?: string) => text?.trim() || undefined
  const clubChanges = Object.fromEntries(
    Object.entries({
      name: tidy(fields.name),
      shortName: (fields.shortName?.length ?? 0) >= 2 ? fields.shortName : undefined,
      city: tidy(fields.city),
      colors: fields.colors,
    }).filter(([key, v]) => v !== undefined && v !== club[key as keyof ClubFields]),
  )
  const nameChanges = Object.entries(names)
    .map(([id, name]): [string, string] => [id, name.trim()])
    .filter(([id, name]) => name && name !== world.players[id].name)
  const changed = Object.keys(clubChanges).length > 0 || nameChanges.length > 0

  const submit = () => {
    const players = { ...world.players }
    for (const [id, name] of nameChanges) players[id] = { ...players[id], name }
    props.onSave({
      ...game,
      world: {
        ...world,
        clubs: { ...world.clubs, [club.id]: { ...club, ...clubChanges } },
        players,
      },
      names: { ...game.names, edited: true },
    })
  }

  return (
    <>
      <Card className="gap-3">
        <CardHeader className="flex flex-row items-center gap-3">
          <ClubCrest club={{ ...club, ...clubChanges }} className="size-10" />
          <CardTitle className="flex-1 truncate">{tidy(fields.name) ?? club.name}</CardTitle>
          <Button onClick={submit} disabled={!changed}>
            <SaveIcon />
            Salvar
          </Button>
        </CardHeader>
        <CardContent>
          <ClubFieldsForm value={fields} base={club} onChange={setFields} />
        </CardContent>
      </Card>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Jogadores</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="grid gap-2 sm:grid-cols-2">
            {squad.map((player) => (
              <li key={player.id} className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-center text-xs font-semibold text-muted-foreground">
                  {player.position}
                </span>
                <Input
                  aria-label={`Nome de ${player.name}`}
                  className="h-8"
                  value={names[player.id]}
                  placeholder={player.name}
                  maxLength={PACK_LIMITS.name}
                  onChange={(e) => setNames({ ...names, [player.id]: e.target.value })}
                />
                <span className="w-7 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
                  {player.overall}
                </span>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </>
  )
}
