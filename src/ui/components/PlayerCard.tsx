import { cn } from '@/lib/utils'
import type { Club, GameState, Player } from '../../engine/model/types.ts'
import { faces, styleLevel } from '../../engine/player/attributes.ts'
import { FREE_AGENT } from '../../engine/model/types.ts'
import {
  CARD_TIER_NAMES,
  cardTier,
  FACE_NAMES,
  styleName,
  styleTitle,
  type CardTier,
} from '../format.ts'
import { ClubCrest } from './ClubCrest.tsx'

const TIER_CLASSES: Record<CardTier, string> = {
  bronze: 'from-amber-800 via-orange-300 to-amber-700 text-amber-950',
  prata: 'from-slate-400 via-slate-100 to-slate-400 text-slate-900',
  ouro: 'from-amber-500 via-yellow-200 to-amber-500 text-amber-950',
  rodada: 'from-slate-950 via-emerald-800 to-slate-950 text-yellow-300',
  craque: 'from-indigo-950 via-fuchsia-700 to-indigo-950 text-white',
}

/** Initials for the portrait spot: we have no photos, and never use real ones. */
const initials = (name: string) =>
  name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()

/** How a weaker foot rates, as five stars. */
export function Stars(props: { value: number; className?: string }) {
  return (
    <span className={props.className} aria-label={`${props.value} de 5 estrelas`}>
      {'★'.repeat(props.value)}
      <span className="opacity-30">{'★'.repeat(5 - props.value)}</span>
    </span>
  )
}

/**
 * A player's card, upright: overall and position in the corner, the club
 * crest, the name, six face numbers in two columns, feet and styles. The
 * colour follows the overall band, or marks the round's best XI and the
 * player of the season. Without a game, `club` gives the crest.
 */
export function PlayerCard(props: {
  player: Player
  game?: GameState
  club?: Club
  className?: string
}) {
  const { player, game } = props
  const tier = cardTier(player, game)
  const club =
    props.club ??
    (game && player.clubId !== FREE_AGENT ? game.world.clubs[player.clubId] : undefined)
  const numbers = faces(player)
  const special = tier === 'rodada' || tier === 'craque'
  return (
    <figure
      className={cn(
        'relative flex w-48 shrink-0 flex-col items-center overflow-hidden rounded-t-[2.5rem] rounded-b-2xl bg-gradient-to-br px-3 pt-3 pb-3 shadow-lg ring-1 ring-black/20 select-none',
        TIER_CLASSES[tier],
        props.className,
      )}
      aria-label={`Carta de ${player.name}: geral ${player.overall}, ${CARD_TIER_NAMES[tier]}`}
    >
      <div className="pointer-events-none absolute inset-1.5 rounded-t-[2.2rem] rounded-b-xl border border-current/25" />
      <div className="flex w-full items-start justify-between">
        <div className="flex flex-col items-center leading-none">
          <span className="text-4xl font-black tabular-nums">{player.overall}</span>
          <span className="text-sm font-bold">{player.position}</span>
          {club && <ClubCrest club={club} className="mt-1 size-7" />}
        </div>
        <div className="mt-1 flex size-20 items-center justify-center rounded-full bg-current/10 text-2xl font-black tracking-tight">
          <span className="opacity-80">{initials(player.name)}</span>
        </div>
      </div>
      <figcaption className="mt-1 w-full truncate border-b border-current/30 pb-1 text-center text-base font-extrabold uppercase">
        {player.name}
      </figcaption>
      <dl className="mt-1.5 grid w-full grid-cols-2 gap-x-3 gap-y-0.5 text-sm">
        {numbers.map(({ face, value }) => (
          <div key={face} className="flex items-baseline gap-1.5" title={FACE_NAMES[face].name}>
            <dd className="w-6 text-right font-black tabular-nums">{value}</dd>
            <dt className="font-semibold opacity-80">{FACE_NAMES[face].short}</dt>
          </div>
        ))}
      </dl>
      <div className="mt-1.5 flex w-full items-center justify-between border-t border-current/30 pt-1 text-xs font-semibold">
        <span title={`Pé ${player.foot}`}>Pé {player.foot === 'direito' ? 'D' : 'E'}</span>
        <span title="Perna ruim">
          <Stars value={player.weakFoot} />
        </span>
      </div>
      {player.styles.length > 0 && (
        <div className="mt-1 flex flex-wrap justify-center gap-1">
          {player.styles.map((style) => {
            const level = styleLevel(player, style)
            return (
              <span
                key={style}
                title={styleTitle(style, level)}
                className={cn(
                  'rounded-full px-1.5 text-[0.65rem] leading-4 font-bold',
                  level === 2 ? 'bg-black/70 text-yellow-300' : 'bg-current/15',
                )}
              >
                {styleName(style, level)}
              </span>
            )
          })}
        </div>
      )}
      {special && (
        <span className="mt-1.5 rounded-full bg-black/30 px-2 text-[0.65rem] leading-4 font-bold tracking-wide uppercase">
          {CARD_TIER_NAMES[tier]}
        </span>
      )}
    </figure>
  )
}
