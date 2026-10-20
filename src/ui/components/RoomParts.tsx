import type { ReactNode } from 'react'
import { ArrowLeftIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cleanShortName } from '../../engine/pack/pack.ts'
import { TEAM_LIMITS, type TeamIdentity } from '../../engine/room/team.ts'
import { ROOM_LIMITS, type RoomOptions } from '../../engine/room/types.ts'
import {
  DRAFT_ORDER_LABELS,
  INJURY_LABELS,
  LEGS_LABELS,
  TRADE_LABELS,
  type RoomOptionsDraft,
} from '../room.ts'
import { Choices } from './Choices.tsx'
import { Crest } from './ClubCrest.tsx'
import { ThemeToggle } from './ThemeToggle.tsx'

/** The frame of the room pages: a title, the way back and the theme switch. */
export function RoomPage(props: { title: string; back?: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-1">
          <Button asChild variant="ghost" size="icon" aria-label="Voltar">
            <Link to={props.back ?? '/salas'}>
              <ArrowLeftIcon />
            </Link>
          </Button>
          <h1 className="truncate text-2xl font-bold">{props.title}</h1>
        </div>
        <ThemeToggle />
      </header>
      {props.children}
    </main>
  )
}

export function Note(props: { children: ReactNode }) {
  return (
    <Card>
      <CardContent className="text-sm text-muted-foreground">{props.children}</CardContent>
    </Card>
  )
}

/** A team's crest, drawn from its colours and short name like the career's clubs. */
export function TeamCrest(props: { team: TeamIdentity; id: string; className?: string }) {
  return (
    <Crest
      id={`room-crest-${props.id}`}
      colors={props.team.colors}
      letters={props.team.shortName || '?'}
      label={`Escudo do ${props.team.name}`}
      className={props.className}
    />
  )
}

function Field(props: { label: string; htmlFor?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={props.htmlFor}>{props.label}</Label>
      {props.children}
    </div>
  )
}

/** Name, short name and colours of a team, with its crest as it will look. */
export function TeamFields(props: {
  id: string
  value: TeamIdentity
  onChange: (team: TeamIdentity) => void
}) {
  const { id, value } = props
  const set = (patch: Partial<TeamIdentity>) => props.onChange({ ...value, ...patch })
  const color = (key: 'primary' | 'secondary', label: string) => (
    <input
      id={key === 'primary' ? `${id}-cor` : undefined}
      type="color"
      aria-label={label}
      className="h-9 w-12 cursor-pointer rounded-md border bg-transparent p-1"
      value={value.colors[key]}
      onChange={(e) => set({ colors: { ...value.colors, [key]: e.target.value.toLowerCase() } })}
    />
  )
  return (
    <div className="flex flex-wrap items-end gap-3">
      <TeamCrest team={value} id={id} className="size-12 shrink-0" />
      <Field label="Nome do time" htmlFor={`${id}-nome`}>
        <Input
          id={`${id}-nome`}
          value={value.name}
          maxLength={TEAM_LIMITS.name.max}
          onChange={(e) => set({ name: e.target.value })}
          className="w-52"
        />
      </Field>
      <Field label="Sigla" htmlFor={`${id}-sigla`}>
        <Input
          id={`${id}-sigla`}
          value={value.shortName}
          onChange={(e) => set({ shortName: cleanShortName(e.target.value) })}
          className="w-20"
        />
      </Field>
      <Field label="Cores" htmlFor={`${id}-cor`}>
        <div className="flex gap-2">
          {color('primary', 'Cor principal')}
          {color('secondary', 'Cor secundária')}
        </div>
      </Field>
    </div>
  )
}

const TEAM_COUNTS = Array.from(
  { length: (ROOM_LIMITS.maxTeams - ROOM_LIMITS.minTeams) / 2 + 1 },
  (_, i) => String(ROOM_LIMITS.minTeams + 2 * i),
)

function Option(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{props.label}</span>
      {props.children}
      {props.hint && <span className="text-xs text-muted-foreground">{props.hint}</span>}
    </div>
  )
}

/** Everything the owner picks for a room: the options of the draft and the league, and when the draft is. */
export function RoomOptionsFields(props: {
  value: RoomOptionsDraft
  onChange: (value: RoomOptionsDraft) => void
  /** People already in the room; the number of teams can't go below it. */
  people?: number
}) {
  const { value } = props
  const options = value.options
  const set = (patch: Partial<RoomOptions>) =>
    props.onChange({ ...value, options: { ...options, ...patch } })
  const people = props.people ?? 1
  return (
    <div className="flex flex-col gap-4">
      <Field label="Nome da sala" htmlFor="sala-nome">
        <Input
          id="sala-nome"
          value={value.name}
          maxLength={40}
          onChange={(e) => props.onChange({ ...value, name: e.target.value })}
          placeholder="Liga dos amigos"
        />
      </Field>
      <Field label="Data e hora do draft" htmlFor="sala-draft">
        <Input
          id="sala-draft"
          type="datetime-local"
          value={value.draftAt}
          onChange={(e) => props.onChange({ ...value, draftAt: e.target.value })}
          className="w-fit"
        />
      </Field>
      <Option label="Times" hint="Pessoas e robôs juntos: quem não entrar até o draft vira robô.">
        <Choices
          ariaLabel="Times"
          options={TEAM_COUNTS.filter((n) => Number(n) >= people)}
          value={String(options.teams)}
          onChange={(n) => set({ teams: Number(n) })}
        />
      </Option>
      <Option label="Elenco" hint="Jogadores de cada time, com no mínimo 2 goleiros.">
        <Choices
          ariaLabel="Elenco"
          options={['16', '18', '20'] as const}
          value={String(options.squadSize) as '16' | '18' | '20'}
          onChange={(n) => set({ squadSize: Number(n) as RoomOptions['squadSize'] })}
        />
      </Option>
      <Option
        label="Ordem do draft"
        hint="Na serpentina, quem escolhe por último numa volta escolhe primeiro na seguinte. Invertida na 3ª volta tira quase toda a vantagem de escolher primeiro."
      >
        <Choices
          ariaLabel="Ordem do draft"
          options={Object.keys(DRAFT_ORDER_LABELS) as RoomOptions['draftOrder'][]}
          value={options.draftOrder}
          label={(o) => DRAFT_ORDER_LABELS[o]}
          onChange={(draftOrder) => set({ draftOrder })}
        />
      </Option>
      <Option label="Tempo por escolha">
        <Choices
          ariaLabel="Tempo por escolha"
          options={['30', '45', '60', '90'] as const}
          value={String(options.pickSeconds) as '30' | '45' | '60' | '90'}
          label={(s) => `${s} s`}
          onChange={(s) => set({ pickSeconds: Number(s) as RoomOptions['pickSeconds'] })}
        />
      </Option>
      <Option
        label="Reservas no automático"
        hint="As escolhas depois da 11ª saem da fila de cada um, para o draft acabar mais rápido."
      >
        <Choices
          ariaLabel="Reservas no automático"
          options={['nao', 'sim'] as const}
          value={options.autoReserves ? 'sim' : 'nao'}
          label={(o) => (o === 'sim' ? 'Ligado' : 'Desligado')}
          onChange={(o) => set({ autoReserves: o === 'sim' })}
        />
      </Option>
      <Option label="Turnos">
        <Choices
          ariaLabel="Turnos"
          options={['1', '2', '3'] as const}
          value={String(options.legs) as '1' | '2' | '3'}
          label={(l) => LEGS_LABELS[Number(l) as RoomOptions['legs']]}
          onChange={(l) => set({ legs: Number(l) as RoomOptions['legs'] })}
        />
      </Option>
      <Option
        label="Prazo de segurança"
        hint='Depois de quanto tempo esperando o "Pronto" de todos você pode jogar a rodada mesmo assim.'
      >
        <Choices
          ariaLabel="Prazo de segurança"
          options={['6', '12', '24', '48'] as const}
          value={String(options.graceHours) as '6' | '12' | '24' | '48'}
          label={(h) => `${h} h`}
          onChange={(h) => set({ graceHours: Number(h) as RoomOptions['graceHours'] })}
        />
      </Option>
      <Option label="Lesões" hint="Curtas duram no máximo duas rodadas.">
        <Choices
          ariaLabel="Lesões"
          options={Object.keys(INJURY_LABELS) as RoomOptions['injuries'][]}
          value={options.injuries}
          label={(o) => INJURY_LABELS[o]}
          onChange={(injuries) => set({ injuries })}
        />
      </Option>
      <Option label="Trocas entre amigos">
        <Choices
          ariaLabel="Trocas entre amigos"
          options={Object.keys(TRADE_LABELS) as RoomOptions['trades'][]}
          value={options.trades}
          label={(o) => TRADE_LABELS[o]}
          onChange={(trades) => set({ trades })}
        />
      </Option>
    </div>
  )
}
