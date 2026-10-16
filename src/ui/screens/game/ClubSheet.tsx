import { useState } from 'react'
import { Badge } from '@/components/ui/badge'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { sectorStrength } from '../../../engine/match/strength.ts'
import { POSITIONS, type Club, type GameState, type Player } from '../../../engine/model/types.ts'
import { conditionOn, formOf } from '../../../engine/season/form.ts'
import {
  clubLineup,
  leagueOf,
  leagueStandings,
  unavailablePlayers,
} from '../../../engine/season/season.ts'
import { useGame } from '../../../store/game.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { Pitch } from '../../components/Pitch.tsx'
import { PlayerStatus } from '../../components/PlayerStatus.tsx'
import { divisionName, POSITION_NAMES, POSTURE_NAMES } from '../../format.ts'
import { PlayerSheet } from './PlayerSheet.tsx'

const OUTCOME_STYLE = {
  V: 'bg-green-600 text-white',
  E: 'bg-muted text-muted-foreground',
  D: 'bg-red-600 text-white',
}

/** Goalkeepers first, then on up the pitch; the best first in each. */
const byPosition = (a: Player, b: Player) =>
  POSITIONS.indexOf(a.position) - POSITIONS.indexOf(b.position) || b.overall - a.overall

/**
 * A club's name that opens its sheet, for a look at an opponent. The user's
 * own club stays a plain name: its squad has a page of its own.
 */
export function ClubLink(props: { clubId: string; short?: boolean; highlight?: boolean }) {
  const game = useGame()
  const [open, setOpen] = useState(false)
  const club = game.world.clubs[props.clubId]
  if (props.clubId === game.userClubId) {
    return <ClubName club={club} short={props.short} highlight={props.highlight} />
  }
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          setOpen(true)
        }}
        title={`Ver o elenco do ${club.name}`}
        className="inline-flex min-w-0 cursor-pointer hover:underline"
      >
        <ClubName club={club} short={props.short} highlight={props.highlight} />
      </button>
      {open && <ClubSheet game={game} club={club} onClose={() => setOpen(false)} />}
    </>
  )
}

/**
 * Another club in a side drawer: where it stands, its last results, the XI
 * it would field today on the pitch and the whole squad, each player's card
 * a tap away.
 */
export function ClubSheet(props: { game: GameState; club: Club; onClose: () => void }) {
  const { game, club } = props
  const { world, season } = game
  const [viewing, setViewing] = useState<Player>()
  const table = leagueStandings(game, leagueOf(world, club.id))
  const index = table.findIndex((row) => row.clubId === club.id)
  const row = table[index]
  const lineup = clubLineup(game, club.id)
  const starters = lineup.starters.map((s) => ({
    player: world.players[s.playerId],
    position: s.position,
  }))
  const sectors = sectorStrength(
    starters.map((s) => ({
      ...s,
      energy: conditionOn(season, s.player, game.today),
      form: formOf(season, s.player.id),
    })),
    lineup.posture,
    lineup.formation,
  )
  const starting = new Set(lineup.starters.map((s) => s.playerId))
  const out = unavailablePlayers(season)
  const squad = club.playerIds.map((id) => world.players[id]).sort(byPosition)

  return (
    <Sheet open onOpenChange={(open) => !open && props.onClose()}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto sm:max-w-md">
        <SheetHeader className="pr-10">
          <SheetTitle className="text-lg leading-tight">
            <ClubName club={club} />
          </SheetTitle>
          <SheetDescription>
            {club.city}, {divisionName(club.division)}
            {row && row.played > 0 && `, ${index + 1}º lugar com ${row.points} pontos`}
          </SheetDescription>
          {row && row.form.length > 0 && (
            <span className="flex gap-1" aria-label="Últimos resultados">
              {row.form.map((outcome, i) => (
                <span
                  key={i}
                  className={cn(
                    'inline-flex size-5 items-center justify-center rounded text-xs font-semibold',
                    OUTCOME_STYLE[outcome],
                  )}
                >
                  {outcome}
                </span>
              ))}
            </span>
          )}
        </SheetHeader>

        <section className="flex flex-col gap-2 px-4 pb-4">
          <h3 className="text-sm font-semibold">
            Escalação de hoje: {lineup.formation}, postura{' '}
            {POSTURE_NAMES[lineup.posture].toLowerCase()}
          </h3>
          <p className="text-xs text-muted-foreground tabular-nums">
            Defesa {Math.round(sectors.defense)} · Meio {Math.round(sectors.midfield)} · Ataque{' '}
            {Math.round(sectors.attack)}
          </p>
          <Pitch
            slots={starters}
            formation={lineup.formation}
            onSelect={(id) => setViewing(world.players[id])}
          />
        </section>

        <section className="flex flex-col gap-1 px-4 pb-6">
          <h3 className="text-sm font-semibold">Elenco ({squad.length})</h3>
          <ul className="flex flex-col divide-y text-sm">
            {squad.map((player) => (
              <li key={player.id}>
                <button
                  type="button"
                  onClick={() => setViewing(player)}
                  className="flex w-full cursor-pointer items-center gap-2 py-1.5 text-left hover:bg-accent"
                  title={POSITION_NAMES[player.position]}
                >
                  <span className="w-4 font-semibold text-muted-foreground">{player.position}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {player.name}{' '}
                    <span className="text-xs text-muted-foreground">{player.age} anos</span>
                  </span>
                  {starting.has(player.id) && <Badge variant="secondary">Titular</Badge>}
                  {out.has(player.id) && <PlayerStatus playerId={player.id} season={season} />}
                  <span className="w-6 text-right font-bold tabular-nums">{player.overall}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      </SheetContent>
      {viewing && (
        <PlayerSheet game={game} player={viewing} onClose={() => setViewing(undefined)} />
      )}
    </Sheet>
  )
}
