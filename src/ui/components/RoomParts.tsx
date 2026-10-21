import type { ReactNode } from 'react'
import { ArrowLeftIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'
import { cleanShortName } from '../../engine/pack/pack.ts'
import { TEAM_LIMITS, type TeamIdentity } from '../../engine/room/team.ts'
import type { RoomOptions } from '../../engine/room/types.ts'
import {
  DRAFT_ORDER_HINTS,
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
export function RoomPage(props: {
  title: string
  back?: string
  /** Room for a side column, as the draft has. */
  wide?: boolean
  children: ReactNode
}) {
  return (
    <main className={cn('mx-auto flex flex-col gap-4 p-4', props.wide ? 'max-w-6xl' : 'max-w-3xl')}>
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

/** Team counts offered; a room made before keeps its own count on the list. */
const TEAM_COUNTS = ['4', '8', '12']

/** The choices offered, with the room's current value kept if it is one no longer offered. */
const offered = <T extends string>(choices: readonly T[], current: T): T[] =>
  choices.includes(current) ? [...choices] : [...choices, current]

function Option(props: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-sm font-medium">{props.label}</span>
      {props.children}
      {props.hint && <span className="text-xs text-muted-foreground">{props.hint}</span>}
    </div>
  )
}

/** What creating a room asks: its name and how many teams; the rest starts as the defaults. */
export function RoomBasicsFields(props: {
  value: RoomOptionsDraft
  onChange: (value: RoomOptionsDraft) => void
}) {
  const { value } = props
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
      <TeamsOption
        options={value.options}
        people={1}
        onChange={(teams) => props.onChange({ ...value, options: { ...value.options, teams } })}
      />
    </div>
  )
}

function TeamsOption(props: {
  options: RoomOptions
  people: number
  onChange: (teams: number) => void
}) {
  return (
    <Option label="Times" hint="Pessoas e robôs juntos: quem não entrar até o draft vira robô.">
      <Choices
        ariaLabel="Times"
        options={offered(TEAM_COUNTS, String(props.options.teams)).filter(
          (n) => Number(n) >= props.people,
        )}
        value={String(props.options.teams)}
        onChange={(n) => props.onChange(Number(n))}
      />
    </Option>
  )
}

/** The rules of the draft and the league, which the owner can change in the waiting room. */
export function RoomRulesFields(props: {
  value: RoomOptions
  onChange: (value: RoomOptions) => void
  /** People already in the room; the number of teams can't go below it. */
  people: number
}) {
  const options = props.value
  const set = (patch: Partial<RoomOptions>) => props.onChange({ ...options, ...patch })
  const legs = String(options.legs) as '1' | '2' | '3'
  return (
    <div className="flex flex-col gap-4">
      <TeamsOption options={options} people={props.people} onChange={(teams) => set({ teams })} />
      <Option label="Elenco" hint="Jogadores de cada time, com no mínimo 2 goleiros.">
        <Choices
          ariaLabel="Elenco"
          options={['16', '18', '20'] as const}
          value={String(options.squadSize) as '16' | '18' | '20'}
          onChange={(n) => set({ squadSize: Number(n) as RoomOptions['squadSize'] })}
        />
      </Option>
      <Option label="Ordem do draft" hint={DRAFT_ORDER_HINTS[options.draftOrder]}>
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
        hint="Depois do 11º jogador, o automático abre a próxima vaga vazia de cada time e fica com a melhor das 5 cartas, para o draft acabar mais rápido."
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
          options={offered(['1', '2'] as const, legs)}
          value={legs}
          label={(l) => LEGS_LABELS[Number(l) as RoomOptions['legs']]}
          onChange={(l) => set({ legs: Number(l) as RoomOptions['legs'] })}
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
