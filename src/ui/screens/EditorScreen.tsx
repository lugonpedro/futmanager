import {
  ArrowDownIcon,
  ArrowUpIcon,
  CheckIcon,
  CopyIcon,
  DownloadIcon,
  PlayIcon,
  RotateCcwIcon,
  Trash2Icon,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { generateWorld } from '../../engine/generate/world.ts'
import { POSITIONS, type Club, type Position } from '../../engine/model/types.ts'
import { packFileName, packToCsv, packToJson } from '../../engine/pack/file.ts'
import {
  alignToSquad,
  emptyPack,
  PACK_LIMITS,
  packIsEmpty,
  packSlots,
  squadOrder,
  type PackClub,
  type PackPlayer,
} from '../../engine/pack/pack.ts'
import { usePackStore } from '../../store/pack.ts'
import { ClubCrest } from '../components/ClubCrest.tsx'
import {
  ClubFieldsForm,
  PackFileButton,
  PackLegalNote,
  PackMessage,
  type ClubFields,
} from '../components/PackControls.tsx'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import { download } from '../download.ts'
import { divisionName, POSITION_NAMES } from '../format.ts'
import { usePackMessage } from '../usePackMessage.ts'
import { AI_PACK_PROMPT } from '../aiPackPrompt.ts'

/** The world the editor shows behind the pack; a real career draws its own. */
const PREVIEW_SEED = 1

const CSV_TYPE = 'text/csv;charset=utf-8'

const hasClubChanges = (club: PackClub | undefined) =>
  !!club && !packIsEmpty({ name: '', clubs: [club] })

/**
 * The team editor: names, short names, cities and colours of the 40 clubs
 * and their players, saved as a data pack in this browser. The pack can be
 * exported as JSON or as a spreadsheet and imported back, here or when
 * starting a new game.
 */
export function EditorScreen() {
  const base = useMemo(() => generateWorld(PREVIEW_SEED), [])
  const slots = useMemo(() => packSlots(base), [base])
  const { pack, setPack } = usePackStore()
  const [index, setIndex] = useState(0)
  const message = usePackMessage()

  const slot = slots[index]
  const entry: PackClub = pack.clubs[index] ?? {}
  const squad = useMemo(() => squadOrder(base, slot), [base, slot])
  const rows = alignToSquad(squad, entry.players ?? [])
  const shown: Club = { ...slot, ...definedFields(entry) }

  /** The pack's clubs with room up to the given slot. */
  const clubsUpTo = (last: number) =>
    Array.from({ length: Math.max(pack.clubs.length, last + 1) }, (_, i) => pack.clubs[i] ?? {})

  const updateClub = (club: PackClub) => {
    const clubs = clubsUpTo(index)
    clubs[index] = club
    setPack({ ...pack, clubs })
  }

  const updatePlayer = (row: number, fields: Partial<PackPlayer>) => {
    const players = rows.map((p, i) => (i === row ? { ...p, ...fields } : p))
    updateClub({ ...entry, players })
  }

  const move = (delta: number) => {
    const target = index + delta
    const clubs = clubsUpTo(Math.max(index, target))
    ;[clubs[index], clubs[target]] = [clubs[target], clubs[index]]
    setPack({ ...pack, clubs })
    setIndex(target)
  }

  const clear = () => {
    if (!window.confirm('Apagar todo o pacote? Não dá para desfazer.')) return
    setPack(emptyPack())
    message.show('Pacote apagado.')
  }

  const exportAs = (extension: 'json' | 'csv') =>
    extension === 'json'
      ? download(packFileName(pack, 'json'), packToJson(pack))
      : download(packFileName(pack, 'csv'), packToCsv(pack), CSV_TYPE)

  const edited = pack.clubs.filter(hasClubChanges).length

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Editor de times</h1>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Voltar</Link>
          </Button>
        </div>
      </header>

      <Card className="gap-3">
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Troque os nomes dos clubes e dos jogadores e comece um novo jogo com eles. A ordem dos
            clubes define a força: o 1º é o maior clube da Série A e o 21º, o maior da Série B. O
            que você deixar em branco é gerado a cada novo jogo; os nomes em cinza são só exemplo.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <div className="flex min-w-48 flex-1 flex-col gap-1.5">
              <Label htmlFor="pacote-nome">Nome do pacote</Label>
              <Input
                id="pacote-nome"
                value={pack.name}
                placeholder="Ex.: Brasileirão da galera"
                maxLength={PACK_LIMITS.name}
                onChange={(e) => setPack({ ...pack, name: e.target.value })}
              />
            </div>
            <PackFileButton
              onLoad={({ pack: loaded, warnings }) => {
                if (
                  !packIsEmpty(pack) &&
                  !window.confirm('Substituir o pacote que está no editor pelo do arquivo?')
                ) {
                  return
                }
                setPack(loaded)
                setIndex(0)
                message.show(`Pacote "${loaded.name || 'sem nome'}" importado.`, warnings)
              }}
              onError={(error) => message.show(error)}
            />
            <Button variant="outline" onClick={() => exportAs('json')}>
              <DownloadIcon />
              Exportar JSON
            </Button>
            <Button variant="outline" onClick={() => exportAs('csv')}>
              <DownloadIcon />
              Exportar planilha
            </Button>
            <Button variant="ghost" onClick={clear} disabled={packIsEmpty(pack) && !pack.name}>
              <Trash2Icon />
              Apagar pacote
            </Button>
            <Button asChild>
              <Link to="/novo">
                <PlayIcon />
                Novo jogo com o pacote
              </Link>
            </Button>
          </div>
          <PackMessage message={message.message} warnings={message.warnings} />
          <p className="text-xs text-muted-foreground">
            {edited === 0
              ? 'Nenhum clube editado ainda.'
              : `${edited} de ${slots.length} clubes com mudanças.`}{' '}
            A planilha tem uma linha por jogador, com as colunas ordem, clube, sigla, cidade, cor1,
            cor2, jogador, posicao (G, Z, L, M ou A), idade e overall.
          </p>
          <AiPrompt />
          <PackLegalNote />
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-[16rem_minmax(0,1fr)]">
        <nav aria-label="Clubes" className="hidden flex-col gap-3 md:flex">
          {base.leagues.map((league) => (
            <div key={league.id} className="flex flex-col gap-1">
              <h2 className="px-2 text-xs font-semibold text-muted-foreground">
                {divisionName(league.division)}
              </h2>
              {slots.map((club, i) =>
                club.division !== league.division ? null : (
                  <button
                    key={club.id}
                    type="button"
                    onClick={() => setIndex(i)}
                    aria-current={i === index}
                    className={cn(
                      'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm',
                      i === index ? 'bg-primary text-primary-foreground' : 'hover:bg-accent',
                    )}
                  >
                    <span className="w-5 shrink-0 text-right text-xs tabular-nums opacity-70">
                      {i + 1}
                    </span>
                    <span
                      className={cn(
                        'truncate',
                        !pack.clubs[i]?.name && i !== index && 'text-muted-foreground',
                      )}
                    >
                      {pack.clubs[i]?.name ?? club.name}
                    </span>
                    {hasClubChanges(pack.clubs[i]) && (
                      <span className="ml-auto size-1.5 shrink-0 rounded-full bg-current" />
                    )}
                  </button>
                ),
              )}
            </div>
          ))}
        </nav>

        <div className="flex min-w-0 flex-col gap-4">
          <div className="md:hidden">
            <Select value={String(index)} onValueChange={(v) => setIndex(Number(v))}>
              <SelectTrigger className="w-full" aria-label="Clube">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-80">
                {slots.map((club, i) => (
                  <SelectItem key={club.id} value={String(i)}>
                    {i + 1}. {pack.clubs[i]?.name ?? club.name} ({divisionName(club.division)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card className="gap-3">
            <CardHeader className="flex flex-row items-center gap-3">
              <ClubCrest club={shown} className="size-10" />
              <div className="flex min-w-0 flex-1 flex-col">
                <CardTitle className="truncate">{shown.name}</CardTitle>
                <span className="text-xs text-muted-foreground">
                  {index + 1}º na ordem · {divisionName(slot.division)}
                </span>
              </div>
              <div className="flex gap-1">
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Subir na ordem"
                  title="Subir na ordem (clube mais forte)"
                  disabled={index === 0}
                  onClick={() => move(-1)}
                >
                  <ArrowUpIcon />
                </Button>
                <Button
                  variant="outline"
                  size="icon"
                  aria-label="Descer na ordem"
                  title="Descer na ordem (clube mais fraco)"
                  disabled={index === slots.length - 1}
                  onClick={() => move(1)}
                >
                  <ArrowDownIcon />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Desfazer as mudanças deste clube"
                  title="Desfazer as mudanças deste clube"
                  disabled={!hasClubChanges(entry) && !entry.players}
                  onClick={() => updateClub({})}
                >
                  <RotateCcwIcon />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <ClubFieldsForm
                value={entry}
                base={slot}
                onChange={(fields: ClubFields) => updateClub({ ...entry, ...fields })}
              />
            </CardContent>
          </Card>

          <Card className="gap-3">
            <CardHeader>
              <CardTitle>Jogadores</CardTitle>
            </CardHeader>
            <CardContent className="px-2 sm:px-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-20">Pos.</TableHead>
                    <TableHead>Nome</TableHead>
                    <TableHead className="w-20">Idade</TableHead>
                    <TableHead className="w-20">Overall</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row, i) => (
                    <PlayerRow
                      key={squad[i].id}
                      row={row}
                      placeholder={squad[i]}
                      onChange={(fields) => updatePlayer(i, fields)}
                    />
                  ))}
                </TableBody>
              </Table>
              <p className="mt-2 px-2 text-xs text-muted-foreground sm:px-0">
                Idade, posição e overall são opcionais. Sem overall, o jogador fica com a força que
                o jogo gerar para o clube.
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </main>
  )
}

/** A prompt to put a pack of real squads together with an AI assistant, ready to copy. */
function AiPrompt() {
  const [copied, setCopied] = useState(false)
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(AI_PACK_PROMPT)
      setCopied(true)
    } catch {
      // Without clipboard access the text is still there to select by hand.
    }
  }
  return (
    <details className="rounded-md border p-3 text-sm">
      <summary className="cursor-pointer font-medium">Montar o pacote com uma IA</summary>
      <div className="mt-3 flex flex-col gap-2">
        <p className="text-muted-foreground">
          Cole este texto num assistente de IA que pesquisa na internet, troque [ANO] e [DATA],
          salve a planilha da resposta como .csv e importe aqui. O texto pede fontes e manda deixar
          de fora o que a IA não confirmar, mas ela ainda pode errar: confira os elencos antes de
          jogar. O pacote é seu e fica só no seu navegador.
        </p>
        <textarea
          readOnly
          aria-label="Prompt para a IA"
          value={AI_PACK_PROMPT}
          className="h-48 w-full resize-y rounded-md border bg-muted/40 p-2 font-mono text-xs"
          onFocus={(e) => e.target.select()}
        />
        <Button variant="outline" size="sm" className="self-start" onClick={copy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
          {copied ? 'Copiado' : 'Copiar o texto'}
        </Button>
      </div>
    </details>
  )
}

function definedFields(club: PackClub): Partial<Club> {
  const { players: _, ...fields } = club
  return Object.fromEntries(Object.entries(fields).filter(([, v]) => v !== undefined))
}

const numberOrUndefined = (text: string) => (text.trim() === '' ? undefined : Number(text))

const outside = (value: number | undefined, limits: { min: number; max: number }) =>
  value !== undefined && (value < limits.min || value > limits.max)

function PlayerRow(props: {
  row: PackPlayer
  placeholder: { name: string; age: number; overall: number; position: Position }
  onChange: (fields: Partial<PackPlayer>) => void
}) {
  const { row, placeholder } = props
  return (
    <TableRow>
      <TableCell className="py-1">
        <select
          aria-label="Posição"
          value={row.position ?? placeholder.position}
          onChange={(e) => props.onChange({ position: e.target.value as Position })}
          className="h-8 w-full cursor-pointer rounded-md border bg-transparent px-1 text-sm dark:bg-input/30"
          title={POSITION_NAMES[row.position ?? placeholder.position]}
        >
          {POSITIONS.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
      </TableCell>
      <TableCell className="py-1">
        <Input
          aria-label="Nome do jogador"
          className="h-8 min-w-32"
          value={row.name ?? ''}
          placeholder={placeholder.name}
          maxLength={PACK_LIMITS.name}
          onChange={(e) =>
            props.onChange({ name: e.target.value.trim() ? e.target.value : undefined })
          }
        />
      </TableCell>
      <TableCell className="py-1">
        <Input
          aria-label="Idade"
          type="number"
          inputMode="numeric"
          className={cn('h-8', outside(row.age, PACK_LIMITS.age) && 'border-destructive')}
          min={PACK_LIMITS.age.min}
          max={PACK_LIMITS.age.max}
          value={row.age ?? ''}
          placeholder={String(placeholder.age)}
          onChange={(e) => props.onChange({ age: numberOrUndefined(e.target.value) })}
        />
      </TableCell>
      <TableCell className="py-1">
        <Input
          aria-label="Overall"
          type="number"
          inputMode="numeric"
          className={cn('h-8', outside(row.overall, PACK_LIMITS.overall) && 'border-destructive')}
          min={PACK_LIMITS.overall.min}
          max={PACK_LIMITS.overall.max}
          value={row.overall ?? ''}
          placeholder={String(placeholder.overall)}
          onChange={(e) => props.onChange({ overall: numberOrUndefined(e.target.value) })}
        />
      </TableCell>
    </TableRow>
  )
}
