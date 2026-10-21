import {
  DndContext,
  DragOverlay,
  MouseSensor,
  pointerWithin,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { ListIcon, MapIcon, WandSparklesIcon } from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { cn } from '@/lib/utils'
import {
  autoLineup,
  changeFormation,
  formationLines,
  setDuty,
  swapPlayers,
} from '../../engine/match/lineup.ts'
import { dutiesFor, ROLE_STYLES, roleOf as slotRole, sideOf } from '../../engine/match/roles.ts'
import {
  dutyFactor,
  positionFit,
  roleOverall,
  sectorStrength,
  slotFit,
} from '../../engine/match/strength.ts'
import type {
  Lineup,
  LineupSlot,
  Player,
  Position,
  Posture,
  TacticalRole,
} from '../../engine/model/types.ts'
import {
  fitClass,
  fitLevel,
  POSITION_NAMES,
  POSTURE_NAMES,
  STYLE_NAMES,
  TACTICAL_ROLE_EFFECTS,
  TACTICAL_ROLE_NAMES,
  type Role,
} from '../format.ts'
import { Choices } from './Choices.tsx'
import { FormationSelect } from './FormationSelect.tsx'
import { Pitch } from './Pitch.tsx'
import { useSwapSpot } from './swapSpot.ts'

/** What a squad list next to the editor needs to pick and swap players. */
export type LineupEditing = {
  /** The player picked for a swap, waiting for the second tap. */
  selected?: string
  /** Picks a player, or swaps him with the one picked before. */
  pick: (playerId: string) => void
  /** Whether a player can be picked: anyone fit, or someone out who is still in the lineup. */
  movable: (playerId: string) => boolean
  roleOf: (playerId: string) => Role
  slotOf: (playerId: string) => LineupSlot | undefined
  /** Saves a whole new lineup, dropping the pick. */
  change: (next: Lineup) => void
}

/**
 * The lineup editor on its own: formation, posture, automatic lineup, the XI
 * on the pitch or by line, and swaps by drag and drop or tap-and-tap. It only
 * gets data and hands back the new lineup, so the career and the online rooms
 * share it. The squad list goes in `children`, inside the same drag area, so
 * its rows can be dropped on the pitch (see `useSwapSpot`).
 */
export function LineupEditor(props: {
  /** Every player the lineup may name, by id. */
  players: Readonly<Record<string, Player>>
  squad: Player[]
  lineup: Lineup
  onChange: (next: Lineup) => void
  /** Who can't play now (injured or banned): kept out of the automatic lineup and of swaps in. */
  unavailable: ReadonlySet<string>
  /** Who misses the next match, crossed out; defaults to `unavailable`. */
  outForMatch?: ReadonlySet<string>
  condition: (playerId: string) => number
  form: (playerId: string) => number
  /** Shown between the controls and the XI, such as the starters who can't play. */
  notice?: (editing: LineupEditing) => ReactNode
  /** Said after the help on swapping, such as what tapping a name does. */
  hint?: ReactNode
  children?: (editing: LineupEditing) => ReactNode
}) {
  const { players, lineup, unavailable } = props
  const outForMatch = props.outForMatch ?? unavailable
  const [selected, setSelected] = useState<string>()
  const [dragging, setDragging] = useState<string>()
  const [showPitch, setShowPitch] = useState(prefersPitch)
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  )

  const slots = new Map(lineup.starters.map((s) => [s.playerId, s.position]))
  const bench = new Set(lineup.bench)
  const roleOf = (id: string): Role =>
    slots.has(id) ? 'titular' : bench.has(id) ? 'reserva' : 'fora'
  const inLineup = (id: string) => roleOf(id) !== 'fora'

  const change = (next: Lineup) => {
    props.onChange(next)
    setSelected(undefined)
  }
  const movable = (id: string) => !unavailable.has(id) || inLineup(id)
  /** Swaps two players, as long as one of them is in the lineup. */
  const swap = (a: string, b: string) => {
    if (a === b || !movable(a) || !movable(b)) return false
    if (!inLineup(a) && !inLineup(b)) return false
    const next = swapPlayers(lineup, a, b)
    change(next)
    warnOutOfPosition(next, [a, b])
    return true
  }
  const pick = (id: string) => {
    if (!movable(id)) return
    if (!selected || selected === id) return setSelected(selected === id ? undefined : id)
    if (!swap(selected, id)) setSelected(id)
  }
  /** A player just moved into a slot far from his position plays well below his level. */
  const warnOutOfPosition = (next: Lineup, moved: string[]) => {
    for (const slot of next.starters) {
      if (!moved.includes(slot.playerId) || slots.get(slot.playerId) === slot.position) continue
      const player = players[slot.playerId]
      if (fitLevel(positionFit(player, slot.position)) !== 'poor') continue
      toast.warning(
        `${player.name} (${player.position}) vai jogar como ${POSITION_NAMES[slot.position].toLowerCase()} e rende bem menos fora de posição.`,
      )
    }
  }
  const onDragStart = (event: DragStartEvent) => setDragging(playerOf(event.active))
  const onDragEnd = (event: DragEndEvent) => {
    setDragging(undefined)
    if (event.over) swap(playerOf(event.active), playerOf(event.over))
  }

  const starters = lineup.starters.map((s) => ({
    player: players[s.playerId],
    position: s.position,
    role: s.role,
    duty: s.duty,
  }))
  const sectors = sectorStrength(
    starters.map((s) => ({
      ...s,
      energy: props.condition(s.player.id),
      form: props.form(s.player.id),
    })),
    lineup.posture,
  )

  const editing: LineupEditing = {
    selected,
    pick,
    movable,
    roleOf,
    slotOf: (id) => lineup.starters.find((s) => s.playerId === id),
    change,
  }
  const dragged = dragging ? players[dragging] : undefined
  const selectedSlot = selected ? editing.slotOf(selected) : undefined

  return (
    <DndContext
      sensors={sensors}
      // The drop goes where the finger or cursor is, not where the dragged chip overlaps most.
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(undefined)}
    >
      <Card className="gap-3 px-4">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <label className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Formação</span>
            <FormationSelect
              value={lineup.formation}
              onChange={(f) => change(changeFormation(lineup, f, players))}
            />
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Postura</span>
            <Choices
              ariaLabel="Postura"
              options={Object.keys(POSTURE_NAMES) as Posture[]}
              value={lineup.posture}
              onChange={(p) => change({ ...lineup, posture: p })}
              label={(p) => POSTURE_NAMES[p]}
            />
          </div>
          <Button
            size="sm"
            onClick={() =>
              change(autoLineup(props.squad, lineup.formation, lineup.posture, unavailable))
            }
          >
            <WandSparklesIcon />
            Escalar automaticamente
          </Button>
          <p className="text-sm text-muted-foreground tabular-nums">
            Defesa {Math.round(sectors.defense)} · Meio {Math.round(sectors.midfield)} · Ataque{' '}
            {Math.round(sectors.attack)}
          </p>
        </div>

        {props.notice?.(editing)}
        {showPitch ? (
          <div className="w-full md:mx-auto md:max-w-lg">
            <Pitch
              slots={starters}
              formation={lineup.formation}
              unavailable={outForMatch}
              selected={selected}
              onSelect={pick}
              wrap={(id, className, player) => (
                <DragSlot id={id} className={className}>
                  {player}
                </DragSlot>
              )}
            />
          </div>
        ) : (
          <StarterLines
            lines={formationLines(starters, lineup.formation)}
            unavailable={outForMatch}
            selected={selected}
            onSelect={pick}
          />
        )}

        {selectedSlot && (
          <DutyPicker
            player={players[selectedSlot.playerId]}
            slot={selectedSlot}
            onPick={(duty) => change(setDuty(lineup, selectedSlot.playerId, duty))}
          />
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-xs text-muted-foreground">
            Arraste um jogador até outro, ou toque em um e depois no outro, para trocá-los de lugar.
            Tocando num titular, dá para escolher a função dele, como falso 9 ou corta pra dentro.
            Cada vaga tem uma função, como volante ou ponta, e a cor dela mostra o encaixe:{' '}
            <span className={fitClass(1)}>bom</span>, <span className={fitClass(0.95)}>serve</span>{' '}
            ou <span className={fitClass(0.72)}>improvisado</span>.
            {props.hint && <> {props.hint}</>}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setShowPitch(!showPitch)
              savePitchPreference(!showPitch)
            }}
          >
            {showPitch ? <ListIcon /> : <MapIcon />}
            {showPitch ? 'Ver em lista' : 'Ver no campo'}
          </Button>
        </div>
      </Card>

      {props.children?.(editing)}

      <DragOverlay dropAnimation={null}>
        {dragged && (
          <span className="inline-flex items-center gap-2 rounded-md bg-yellow-300 px-2 py-1 text-sm font-semibold text-green-950 shadow-lg">
            {dragged.position} {dragged.name} {dragged.overall}
          </span>
        )}
      </DragOverlay>
    </DndContext>
  )
}

const playerOf = (spot: { data: { current?: Record<string, unknown> } }) =>
  spot.data.current!.playerId as string

/** A starter, as a chip or on the pitch, that can be dragged onto another player and take a drop. */
function DragSlot(props: {
  id: string
  className: string
  children: ReactNode
  place?: 'chip' | 'pitch'
}) {
  const { setNode, listeners, isDragging, isOver } = useSwapSpot(props.id, props.place ?? 'pitch')
  return (
    <div
      ref={setNode}
      {...listeners}
      className={cn(
        props.className,
        'touch-manipulation',
        isDragging && 'opacity-40',
        isOver && !isDragging && 'rounded ring-2 ring-yellow-300',
      )}
    >
      {props.children}
    </div>
  )
}

const PITCH_KEY = 'futmanager-elenco-campo'

/** The XI shows on the pitch unless the user switched to the list before. */
function prefersPitch(): boolean {
  try {
    return localStorage.getItem(PITCH_KEY) !== 'lista'
  } catch {
    return true
  }
}

function savePitchPreference(pitch: boolean) {
  try {
    localStorage.setItem(PITCH_KEY, pitch ? 'campo' : 'lista')
  } catch {
    // Without storage the pitch just shows again next time.
  }
}

/**
 * The role picker for the starter picked on the pitch: any role of his part
 * of the pitch, each with his level in it, and what the chosen one does.
 */
function DutyPicker(props: {
  player: Player
  slot: LineupSlot
  onPick: (duty: TacticalRole) => void
}) {
  const { player, slot } = props
  const role = slotRole(slot)
  const suits = (ROLE_STYLES[role] ?? []).filter((style) => player.styles.includes(style))
  const side = sideOf(slot.role)
  const factor = dutyFactor(player, slot)
  return (
    <div className="flex flex-col gap-1.5 rounded-md border p-3">
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span>
          Função de <span className="font-semibold">{player.name}</span>
        </span>
        <Select value={role} onValueChange={(value) => props.onPick(value as TacticalRole)}>
          <SelectTrigger size="sm" className="min-w-44" aria-label="Função">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {dutiesFor(slot).map((duty) => (
              <SelectItem key={duty} value={duty}>
                <span className="w-8 font-bold">{duty}</span>
                {TACTICAL_ROLE_NAMES[duty]}
                <span className="text-xs text-muted-foreground tabular-nums">
                  {Math.round(roleOverall(player, duty))}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {slot.duty && slot.role && (
          <span className="text-xs text-muted-foreground">
            (a vaga é de {TACTICAL_ROLE_NAMES[slot.role].toLowerCase()})
          </span>
        )}
      </label>
      <p className="text-xs text-muted-foreground">
        {TACTICAL_ROLE_EFFECTS[role]}
        {role === 'CPD' &&
          side &&
          ` Pé ${player.foot}, ${(side === 'direita') === (player.foot === 'esquerdo') ? 'rende mais' : 'rende menos'} pela ${side}.`}
        {slot.duty &&
          suits.length > 0 &&
          ` Combina com ${suits.map((s) => STYLE_NAMES[s]).join(' e ')}.`}
        {slot.duty &&
          factor !== 1 &&
          ` Rende ${factor > 1 ? '+' : ''}${Math.round((factor - 1) * 100)}% nessa função.`}
      </p>
    </div>
  )
}

/** What each line of the XI is called, from the keeper forwards. */
function lineName(line: readonly { position: Position; role?: TacticalRole }[]): string {
  const position = line[0].position
  if (position === 'G') return 'Goleiro'
  if (position === 'A') return 'Ataque'
  if (position !== 'M') return 'Defesa'
  if (line.every((s) => s.role === 'VOL')) return line.length > 1 ? 'Volantes' : 'Volante'
  if (line.some((s) => s.role === 'MEI')) return line.length > 1 ? 'Meias' : 'Meia'
  return 'Meio'
}

/** The XI as chips by line, each one a drag handle and a drop target like on the pitch. */
function StarterLines(props: {
  lines: { player: Player; position: Position; role?: TacticalRole; duty?: TacticalRole }[][]
  unavailable: ReadonlySet<string>
  selected?: string
  onSelect: (playerId: string) => void
}) {
  return (
    <div className="flex flex-col gap-2">
      {props.lines.map((line, i) => (
        <div key={i} className="flex flex-col gap-1 sm:flex-row sm:items-start sm:gap-2">
          <span className="shrink-0 text-xs text-muted-foreground sm:w-16 sm:pt-2">
            {lineName(line)}
          </span>
          <div className="grid min-w-0 flex-1 grid-cols-2 gap-2 sm:flex sm:flex-wrap">
            {line.map((slot) => {
              const { player } = slot
              const role = slotRole(slot)
              const fit = slotFit(player, slot)
              const selected = props.selected === player.id
              const out = props.unavailable.has(player.id)
              return (
                <DragSlot key={player.id} id={player.id} place="chip" className="min-w-0 sm:w-48">
                  <button
                    type="button"
                    onClick={() => props.onSelect(player.id)}
                    title={`${TACTICAL_ROLE_NAMES[role]}${player.position !== slot.position ? ` (é ${POSITION_NAMES[player.position].toLowerCase()})` : ''}`}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-left text-sm hover:bg-accent',
                      out && !selected && 'border-destructive/60 bg-destructive/10',
                      selected &&
                        'border-yellow-400 bg-yellow-300 text-green-950 hover:bg-yellow-300',
                    )}
                  >
                    <span className={cn('w-8 text-xs font-bold', !selected && fitClass(fit))}>
                      {role}
                    </span>
                    <span className={cn('min-w-0 flex-1 truncate', out && 'line-through')}>
                      {player.name}
                    </span>
                    <span className="font-semibold tabular-nums">{player.overall}</span>
                  </button>
                </DragSlot>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}
