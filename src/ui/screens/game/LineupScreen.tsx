import { useState } from 'react'
import {
  autoLineup,
  changeFormation,
  FORMATION_LIST,
  swapPlayers,
} from '../../../engine/match/lineup.ts'
import { positionFit, sectorStrength } from '../../../engine/match/strength.ts'
import type { Lineup, Player, Posture, Season } from '../../../engine/model/types.ts'
import { clubLineup, unavailablePlayers } from '../../../engine/season/season.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { Pitch } from '../../components/Pitch.tsx'
import { PlayerStatus } from '../../components/PlayerStatus.tsx'
import { POSITION_NAMES, POSITION_ORDER, POSTURE_NAMES } from '../../format.ts'

/** Formation, posture and who plays, saved for every match until changed. */
export function LineupScreen() {
  const game = useGame()
  const setGame = useGameStore((s) => s.setGame)
  const [selected, setSelected] = useState<string>()
  const { world, season, userClubId } = game
  const squad = world.clubs[userClubId].playerIds.map((id) => world.players[id])
  const out = unavailablePlayers(season)
  const lineup = clubLineup(game, userClubId)

  const save = (next: Lineup) => {
    setGame({ ...game, userLineup: next })
    setSelected(undefined)
  }
  const pick = (id: string) => {
    if (out.has(id)) return
    if (!selected || selected === id) return setSelected(selected === id ? undefined : id)
    const inLineup = (pid: string) =>
      lineup.bench.includes(pid) || lineup.starters.some((s) => s.playerId === pid)
    // Two players outside the lineup have nothing to swap.
    if (!inLineup(selected) && !inLineup(id)) return setSelected(id)
    save(swapPlayers(lineup, selected, id))
  }

  const starters = lineup.starters.map((s) => ({
    player: world.players[s.playerId],
    position: s.position,
  }))
  const sectors = sectorStrength(
    starters.map((s) => ({ ...s, energy: 100 })),
    lineup.posture,
  )
  const used = new Set([...lineup.starters.map((s) => s.playerId), ...lineup.bench])
  const others = squad
    .filter((p) => !used.has(p.id))
    .sort(
      (a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position] || b.strength - a.strength,
    )

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-3 rounded bg-green-950/60 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-sm text-green-200">Formação</span>
          {FORMATION_LIST.map((f) => (
            <Choice
              key={f}
              active={lineup.formation === f}
              onClick={() => save(changeFormation(lineup, f, world.players))}
            >
              {f}
            </Choice>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="w-20 text-sm text-green-200">Postura</span>
          {(Object.keys(POSTURE_NAMES) as Posture[]).map((p) => (
            <Choice
              key={p}
              active={lineup.posture === p}
              onClick={() => save({ ...lineup, posture: p })}
            >
              {POSTURE_NAMES[p]}
            </Choice>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => save(autoLineup(squad, lineup.formation, lineup.posture, out))}
            className="rounded bg-yellow-400 px-4 py-2 font-semibold text-green-950"
          >
            Escalar automaticamente
          </button>
          <p className="text-sm text-green-200 tabular-nums">
            Defesa {Math.round(sectors.defense)} · Meio {Math.round(sectors.midfield)} · Ataque{' '}
            {Math.round(sectors.attack)}
          </p>
        </div>
        <p className="text-xs text-green-300">
          Toque em um jogador e depois em outro para trocá-los de lugar. Jogador fora de posição
          aparece em laranja e rende menos.
        </p>
      </section>

      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Pitch slots={starters} selected={selected} onSelect={pick} />
        <div className="flex flex-col gap-4">
          <PlayerList
            title="Titulares"
            players={[...lineup.starters]
              .sort((a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position])
              .map((s) => ({ player: world.players[s.playerId], slot: s.position }))}
            selected={selected}
            onPick={pick}
            season={season}
          />
          <PlayerList
            title={`Banco (${lineup.bench.length})`}
            players={lineup.bench.map((id) => ({ player: world.players[id] }))}
            selected={selected}
            onPick={pick}
            season={season}
          />
        </div>
      </div>
      <PlayerList
        title="Fora da lista"
        players={others.map((player) => ({ player, disabled: out.has(player.id) }))}
        selected={selected}
        onPick={pick}
        season={season}
      />
    </div>
  )
}

function Choice(props: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      className={`rounded px-3 py-1 text-sm ${props.active ? 'bg-green-600 font-semibold' : 'bg-green-800 hover:bg-green-700'}`}
    >
      {props.children}
    </button>
  )
}

type ListEntry = { player: Player; slot?: Player['position']; disabled?: boolean }

function PlayerList(props: {
  title: string
  players: ListEntry[]
  selected?: string
  onPick: (id: string) => void
  season: Season
}) {
  return (
    <section className="rounded bg-green-950/60 p-3">
      <h2 className="mb-2 text-sm font-semibold">{props.title}</h2>
      {props.players.length === 0 ? (
        <p className="text-sm text-green-300">Ninguém.</p>
      ) : (
        <ul className="flex flex-col gap-0.5 text-sm">
          {props.players.map(({ player, slot, disabled }) => {
            const offPosition = slot && positionFit(player, slot) < 1
            return (
              <li key={player.id}>
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => props.onPick(player.id)}
                  className={`flex w-full items-center gap-2 rounded px-2 py-1 text-left disabled:opacity-50 ${props.selected === player.id ? 'bg-yellow-400 text-green-950' : 'hover:bg-green-800'}`}
                >
                  {slot && (
                    <span
                      className="w-4 font-semibold"
                      title={`Jogando de ${POSITION_NAMES[slot].toLowerCase()}`}
                    >
                      {slot}
                    </span>
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {player.name}{' '}
                    <span
                      className={
                        offPosition && props.selected !== player.id
                          ? 'text-orange-300'
                          : 'opacity-70'
                      }
                    >
                      ({player.position})
                    </span>
                  </span>
                  <PlayerStatus playerId={player.id} season={props.season} />
                  <span className="w-6 text-right font-bold tabular-nums">{player.strength}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
