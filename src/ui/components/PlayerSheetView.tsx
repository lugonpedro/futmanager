import type { ReactNode } from 'react'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import type { Player, Position, TacticalRole } from '../../engine/model/types.ts'
import { roleOf, ROLES_BY_POSITION } from '../../engine/match/roles.ts'
import { bestRole, slotFit } from '../../engine/match/strength.ts'
import {
  FACE_ATTRIBUTES,
  faceValue,
  FACES,
  KEEPER_FACES,
  nextStyle,
  styleLevel,
} from '../../engine/player/attributes.ts'
import {
  ATTRIBUTE_NAMES,
  FACE_NAMES,
  fitClass,
  FOOT_NAMES,
  POSITION_NAMES,
  rangeText,
  signedChange,
  STYLE_EFFECTS,
  STYLE_NAMES,
  styleName,
  styleSource,
  TACTICAL_ROLE_NAMES,
} from '../format.ts'
import { PlayerCard } from './PlayerCard.tsx'
import { AvailabilityTags, type PlayerAvailability } from './PlayerStatus.tsx'

/**
 * A player's sheet in a side drawer, from the player and his situation alone:
 * the card, what he plays, condition and form, and every attribute with a bar.
 * The career's `PlayerSheet` and the online rooms fill in the rest through
 * the slots: `badges`, `notes` under the card, more `facts`, more `sections`
 * and the `footer` with actions.
 */
export function PlayerSheetView(props: {
  player: Player
  onClose: () => void
  /** After the position and age, such as the club. */
  subtitle?: string
  /** Next to the name, such as the favorite star. */
  titleExtra?: ReactNode
  badges?: ReactNode
  availability?: PlayerAvailability
  /** Defaults to the card without a game. */
  card?: ReactNode
  notes?: ReactNode
  potential?: { low: number; high: number }
  /** How much the overall moved in the last month. */
  growth?: number
  slot?: { position: Position; role?: TacticalRole }
  condition?: number
  form?: number
  facts?: ReactNode
  sections?: ReactNode
  footer?: ReactNode
}) {
  const { player, slot, growth, condition, form } = props
  const fit = slot && slotFit(player, slot)
  return (
    <Sheet open onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-10">
          <SheetTitle className="flex items-center gap-1 text-lg leading-tight">
            {player.name}
            {props.titleExtra}
          </SheetTitle>
          <SheetDescription>
            {POSITION_NAMES[player.position]}, {player.age} anos
            {props.subtitle && `, ${props.subtitle}`}
          </SheetDescription>
          <span className="flex flex-wrap gap-1">
            {props.badges}
            {props.availability && <AvailabilityTags {...props.availability} />}
          </span>
        </SheetHeader>

        <div className="flex justify-center px-4 pb-2">
          {props.card ?? <PlayerCard player={player} />}
        </div>
        {props.notes}

        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-2 text-sm sm:grid-cols-3">
          <SheetItem label="Geral">
            {player.overall}
            {growth !== undefined && growth !== 0 && (
              <span
                className={cn(
                  'ml-1 text-xs',
                  growth > 0
                    ? 'text-green-700 dark:text-green-400'
                    : 'text-red-600 dark:text-red-400',
                )}
                title="No último mês"
              >
                {signedChange(growth)} no mês
              </span>
            )}
          </SheetItem>
          {props.potential && (
            <SheetItem label="Potencial">
              <span title="Fica mais preciso conforme ele joga">{rangeText(props.potential)}</span>
            </SheetItem>
          )}
          <SheetItem label="Pé preferido">{FOOT_NAMES[player.foot]}</SheetItem>
          <SheetItem label="Posições" wide>
            {[player.position, ...player.secondary].map((p) => POSITION_NAMES[p]).join(', ')}
          </SheetItem>
          {ROLES_BY_POSITION[player.position].length > 1 && (
            <SheetItem label="Melhor função">{TACTICAL_ROLE_NAMES[bestRole(player)]}</SheetItem>
          )}
          {slot && fit !== undefined && (
            <SheetItem label="Jogando de">
              <span className={fitClass(fit)}>
                {TACTICAL_ROLE_NAMES[roleOf(slot)]}
                {slot.position !== player.position &&
                  fit < 1 &&
                  `, rende ${Math.round(fit * 100)}%`}
              </span>
            </SheetItem>
          )}
          {condition !== undefined && (
            <SheetItem label="Condição física">
              <span className={cn(condition < 85 && 'text-amber-600 dark:text-yellow-300')}>
                {condition}%
              </span>
            </SheetItem>
          )}
          {form !== undefined && (
            <SheetItem label="Forma">
              <FormMark form={form} />
            </SheetItem>
          )}
          {props.facts}
        </dl>

        <StylesSection player={player} />

        <SheetSection title="Atributos">
          <div className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
            {(player.position === 'G' ? KEEPER_FACES : FACES).map((face) => {
              const parts = FACE_ATTRIBUTES[face]
              const value = Math.round(faceValue(player.attributes, face))
              return (
                <div key={face} className="flex flex-col gap-1">
                  <div className="flex items-baseline justify-between text-sm font-semibold">
                    <span>{FACE_NAMES[face].name}</span>
                    <span className="tabular-nums">{value}</span>
                  </div>
                  {parts.length === 1 ? (
                    <Bar value={value} />
                  ) : (
                    parts.map((attribute) => (
                      <AttributeBar
                        key={attribute}
                        label={ATTRIBUTE_NAMES[attribute]}
                        value={player.attributes[attribute]}
                      />
                    ))
                  )}
                </div>
              )
            })}
          </div>
        </SheetSection>

        {props.sections}
        {props.footer && <SheetFooter className="flex-row flex-wrap">{props.footer}</SheetFooter>}
      </SheetContent>
    </Sheet>
  )
}

/**
 * His styles with what each does and where it comes from, and the one he is
 * close to picking up, so training has something to aim at.
 */
function StylesSection({ player }: { player: Player }) {
  const next = nextStyle(player)
  if (player.styles.length === 0 && !next) return null
  return (
    <SheetSection title="Estilos de jogo">
      <ul className="flex flex-col gap-2 text-sm">
        {player.styles.map((style) => {
          const level = styleLevel(player, style)
          return (
            <li key={style}>
              <span className="font-semibold">{styleName(style, level)}</span>{' '}
              <span className="text-muted-foreground">
                {STYLE_EFFECTS[style]} Vem de {styleSource(style).toLowerCase()}.
                {level === 2 && ' O "+" vale o dobro.'}
              </span>
            </li>
          )
        })}
        {next && (
          <li className="text-muted-foreground">
            Perto de ganhar <span className="font-semibold">{STYLE_NAMES[next]}</span>: falta pouco
            em {styleSource(next).toLowerCase()}.
          </li>
        )}
      </ul>
    </SheetSection>
  )
}

const FORM_LABELS: Record<number, string> = {
  [-2]: 'Péssima',
  [-1]: 'Em baixa',
  0: 'Normal',
  1: 'Em alta',
  2: 'Ótima',
}

const FORM_ARROWS: Record<number, string> = { [-2]: '⇊', [-1]: '↓', 0: '→', 1: '↑', 2: '⇈' }

const formClass = (form: number) =>
  cn(form > 0 && 'text-green-700 dark:text-green-400', form < 0 && 'text-red-600 dark:text-red-400')

/** Form as an arrow and a word: green going up, red going down. */
export function FormMark({ form }: { form: number }) {
  return (
    <span className={formClass(form)}>
      {FORM_ARROWS[form]} {FORM_LABELS[form]}
    </span>
  )
}

/** Just the arrow, for tables. */
export function FormArrow({ form }: { form: number }) {
  return (
    <span className={formClass(form)} title={`Forma: ${FORM_LABELS[form]}`}>
      {FORM_ARROWS[form]}
    </span>
  )
}

function AttributeBar(props: { label: string; value: number }) {
  return (
    <div className="grid grid-cols-[1fr_2rem] items-center gap-x-2 text-xs">
      <span className="truncate text-muted-foreground">{props.label}</span>
      <span className="text-right font-semibold tabular-nums">{props.value}</span>
      <span className="col-span-2">
        <Bar value={props.value} />
      </span>
    </div>
  )
}

/** A 1 to 99 value as a bar, green when great and red when poor. */
function Bar({ value }: { value: number }) {
  const colour =
    value >= 80
      ? 'bg-green-600'
      : value >= 65
        ? 'bg-lime-500'
        : value >= 50
          ? 'bg-yellow-500'
          : value >= 35
            ? 'bg-orange-500'
            : 'bg-red-500'
  return (
    <span className="block h-1.5 overflow-hidden rounded-full bg-muted">
      <span className={cn('block h-full rounded-full', colour)} style={{ width: `${value}%` }} />
    </span>
  )
}

/** A titled block of the sheet, under the attributes. */
export function SheetSection(props: { title: string; children: ReactNode }) {
  return (
    <section className="border-t px-4 py-3">
      <h3 className="mb-2 text-sm font-semibold">{props.title}</h3>
      {props.children}
    </section>
  )
}

/** One fact of the sheet, with its name above it. */
export function SheetItem(props: { label: string; children: ReactNode; wide?: boolean }) {
  return (
    <div className={cn('flex flex-col', props.wide && 'col-span-2')}>
      <dt className="text-xs text-muted-foreground">{props.label}</dt>
      <dd className="font-medium tabular-nums">{props.children}</dd>
    </div>
  )
}
