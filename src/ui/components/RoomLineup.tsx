import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { loadSavedLineup, loadTeamSheet, saveRoomLineup } from '../../cloud/roomLeague.ts'
import type { Lineup, Player } from '../../engine/model/types.ts'
import type { TeamSheet } from '../../engine/room/summary.ts'
import { POSITION_NAMES, POSITION_ORDER, ROLE_NAMES, type Role } from '../format.ts'
import { LineupEditor, type LineupEditing } from './LineupEditor.tsx'
import { FormArrow } from './PlayerSheetView.tsx'
import { useSwapSpot } from './swapSpot.ts'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** How long after the last change the lineup goes to the server. */
const SAVE_DELAY_MS = 800

type Loaded = { sheet?: TeamSheet; saved?: Lineup }

/**
 * The player's lineup for the coming round, saved on the server as it
 * changes. Without changes, the team plays the lineup of the last round.
 */
export function RoomLineup(props: { room: number; slot: number; round: number }) {
  const { room, slot, round } = props
  const [loaded, setLoaded] = useState<Loaded>()
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    Promise.all([loadTeamSheet(room, slot), loadSavedLineup(room, round)])
      .then(([sheet, saved]) => live && setLoaded({ sheet, saved }))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [room, slot, round])

  if (failed || !loaded?.sheet) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          {failed
            ? 'Não deu para carregar o seu time. Atualize a página.'
            : !loaded
              ? 'Carregando o seu time…'
              : 'O seu time aparece aqui depois da próxima rodada. Até lá, ele joga com a escalação da última.'}
        </CardContent>
      </Card>
    )
  }
  // A new round (or a new sheet) starts the editor over.
  return (
    <Editor
      key={`${round}-${slot}`}
      room={room}
      round={round}
      sheet={loaded.sheet}
      start={loaded.saved}
    />
  )
}

function Editor(props: { room: number; round: number; sheet: TeamSheet; start?: Lineup }) {
  const { room, sheet } = props
  const [lineup, setLineup] = useState(props.start ?? sheet.lineup)
  const [saving, setSaving] = useState<'salvo' | 'salvando' | undefined>(
    props.start ? 'salvo' : undefined,
  )
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const players = useMemo(() => Object.fromEntries(sheet.players.map((p) => [p.id, p])), [sheet])
  const out = useMemo(() => new Set(sheet.out), [sheet])
  useEffect(() => () => clearTimeout(timer.current), [])

  const change = (next: Lineup) => {
    setLineup(next)
    setSaving('salvando')
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      saveRoomLineup(room, next)
        .then(() => setSaving('salvo'))
        .catch((error) => {
          setSaving(undefined)
          toast.error(messageOf(error))
        })
    }, SAVE_DELAY_MS)
  }

  return (
    <section className="flex flex-col gap-3">
      <Card className="gap-1">
        <CardHeader>
          <CardTitle>Seu time para a rodada {props.round}</CardTitle>
          <CardDescription>
            {saving === 'salvando'
              ? 'Salvando…'
              : saving === 'salvo'
                ? 'Escalação salva. Dá para mudar até a rodada ser jogada.'
                : 'Sem mudanças, o time joga com a escalação da última rodada, sem os lesionados e suspensos.'}
          </CardDescription>
        </CardHeader>
      </Card>
      <LineupEditor
        players={players}
        squad={sheet.players}
        lineup={lineup}
        onChange={change}
        unavailable={out}
        condition={(id) => sheet.condition[id] ?? 100}
        form={(id) => sheet.form[id] ?? 0}
      >
        {(editing) => <SquadList sheet={sheet} out={out} editing={editing} />}
      </LineupEditor>
    </section>
  )
}

const GROUPS: Role[] = ['titular', 'reserva', 'fora']

function SquadList(props: { sheet: TeamSheet; out: ReadonlySet<string>; editing: LineupEditing }) {
  const { sheet, out, editing } = props
  const sorted = [...sheet.players].sort(
    (a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position] || b.overall - a.overall,
  )
  return (
    <Card className="gap-3 px-4">
      {GROUPS.map((role) => {
        const rows = sorted.filter((p) => editing.roleOf(p.id) === role)
        if (rows.length === 0) return null
        return (
          <div key={role} className="flex flex-col gap-1">
            <h3 className="text-xs font-semibold text-muted-foreground uppercase">
              {ROLE_NAMES[role]}
            </h3>
            <ul className="flex flex-col">
              {rows.map((player) => (
                <SquadRow
                  key={player.id}
                  player={player}
                  out={out.has(player.id)}
                  condition={sheet.condition[player.id] ?? 100}
                  form={sheet.form[player.id] ?? 0}
                  editing={editing}
                />
              ))}
            </ul>
          </div>
        )
      })}
    </Card>
  )
}

function SquadRow(props: {
  player: Player
  out: boolean
  condition: number
  form: number
  editing: LineupEditing
}) {
  const { player, editing } = props
  const disabled = !editing.movable(player.id)
  const { setNode, listeners, isDragging, isOver } = useSwapSpot(player.id, 'sala', disabled)
  const selected = editing.selected === player.id
  return (
    <li
      ref={setNode}
      {...listeners}
      className={cn(
        'flex touch-manipulation items-center gap-2 rounded px-1 py-1 text-sm',
        disabled ? 'opacity-60' : 'cursor-pointer hover:bg-accent',
        selected && 'bg-yellow-300 text-green-950 hover:bg-yellow-300',
        isDragging && 'opacity-40',
        isOver && !isDragging && 'outline-2 -outline-offset-2 outline-yellow-400',
      )}
      onClick={disabled ? undefined : () => editing.pick(player.id)}
    >
      <span className="w-4 font-semibold" title={POSITION_NAMES[player.position]}>
        {player.position}
      </span>
      <span className={cn('min-w-0 flex-1 truncate', props.out && 'line-through')}>
        {player.name}
      </span>
      {props.out && <span className="text-xs text-destructive">fora</span>}
      <FormArrow form={props.form} />
      <span className="w-9 text-right text-xs text-muted-foreground tabular-nums" title="Energia">
        {Math.round(props.condition)}%
      </span>
      <span className="w-6 text-right font-semibold tabular-nums">{player.overall}</span>
    </li>
  )
}
