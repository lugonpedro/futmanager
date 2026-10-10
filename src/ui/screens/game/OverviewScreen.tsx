import { useState } from 'react'
import { Link } from 'react-router'
import type { GameState } from '../../../engine/model/types.ts'
import {
  clubLineup,
  isSeasonOver,
  leagueOf,
  leagueStandings,
  seasonSummary,
  startNextSeason,
  userFixture,
} from '../../../engine/season/season.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { simulateRounds } from '../../../worker/simulate.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { divisionName, formatMoney, POSTURE_NAMES } from '../../format.ts'
import { FixtureLine } from './FixtureLine.tsx'

export function OverviewScreen() {
  const game = useGame()
  return isSeasonOver(game.season) ? <SeasonEnd game={game} /> : <NextRound game={game} />
}

function NextRound({ game }: { game: GameState }) {
  const setGame = useGameStore((s) => s.setGame)
  const [busy, setBusy] = useState(false)
  const { season, world, userClubId } = game
  const fixture = userFixture(game)
  const leagueId = leagueOf(world, userClubId)
  const table = leagueStandings(game, leagueId)
  const position = table.findIndex((row) => row.clubId === userClubId) + 1
  const lastRound = season.round > 1 ? season.fixtures[leagueId][season.round - 2] : []
  const lineup = clubLineup(game, userClubId)
  const squad = new Set(world.clubs[userClubId].playerIds)
  const out = [
    ...Object.entries(season.injuries).map(([id, rounds]) => ({ id, rounds, why: 'lesionado' })),
    ...Object.entries(season.suspensions).map(([id, rounds]) => ({ id, rounds, why: 'suspenso' })),
  ].filter(({ id }) => squad.has(id))

  const simulate = async (rounds: number) => {
    setBusy(true)
    try {
      setGame(await simulateRounds(game, rounds))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <section className="flex flex-col gap-3 rounded bg-green-950/60 p-4 md:col-span-2">
        <h2 className="text-sm text-green-200">
          Próximo jogo · rodada {season.round} de {season.totalRounds}
        </h2>
        {fixture && (
          <div className="text-lg">
            <FixtureLine fixture={fixture} world={world} userClubId={userClubId} />
          </div>
        )}
        <p className="text-sm text-green-200">
          Escalação: {lineup.formation}, postura {POSTURE_NAMES[lineup.posture].toLowerCase()}.{' '}
          <Link to="/jogo/escalacao" className="underline">
            Mudar
          </Link>
        </p>
        <div className="flex flex-wrap gap-2">
          <Link
            to="/jogo/partida"
            className={`rounded bg-yellow-400 px-4 py-2 font-semibold text-green-950 ${busy ? 'pointer-events-none opacity-50' : ''}`}
          >
            Jogar ao vivo
          </Link>
          <button
            type="button"
            disabled={busy}
            onClick={() => simulate(1)}
            className="rounded border border-green-400 px-4 py-2 text-green-100 disabled:opacity-50"
          >
            Simular rodada
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => simulate(season.totalRounds)}
            className="rounded border border-green-400 px-4 py-2 text-green-100 disabled:opacity-50"
          >
            Simular até o fim da temporada
          </button>
          {busy && <span className="self-center text-sm text-green-200">Simulando...</span>}
        </div>
      </section>

      <section className="flex flex-col gap-2 rounded bg-green-950/60 p-4">
        <h2 className="font-semibold">
          {table[position - 1].played === 0
            ? divisionName(world.clubs[userClubId].division)
            : `${position}º lugar na ${divisionName(world.clubs[userClubId].division)}`}
        </h2>
        <p className="text-sm text-green-200">
          {table[position - 1].played === 0
            ? 'Ainda sem jogos na temporada.'
            : `${table[position - 1].points} pontos em ${table[position - 1].played} ${table[position - 1].played === 1 ? 'jogo' : 'jogos'}.`}
        </p>
        <h3 className="mt-2 text-sm font-semibold">Desfalques</h3>
        {out.length === 0 ? (
          <p className="text-sm text-green-200">Elenco completo.</p>
        ) : (
          <ul className="text-sm">
            {out.map(({ id, rounds, why }) => (
              <li key={`${id}-${why}`}>
                {world.players[id].name}{' '}
                <span className="text-green-300">
                  ({world.players[id].position}), {why}, volta em {rounds}{' '}
                  {rounds === 1 ? 'rodada' : 'rodadas'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2 rounded bg-green-950/60 p-4">
        <h2 className="font-semibold">
          {lastRound.length ? `Resultados da rodada ${season.round - 1}` : 'Primeira rodada'}
        </h2>
        {lastRound.length === 0 ? (
          <p className="text-sm text-green-200">A temporada {season.year} vai começar.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {lastRound.map((f) => (
              <li key={f.id}>
                <FixtureLine fixture={f} world={world} userClubId={userClubId} />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function SeasonEnd({ game }: { game: GameState }) {
  const setGame = useGameStore((s) => s.setGame)
  const summary = seasonSummary(game)
  const { world, userClubId } = game

  const userOutcome = summary.leagues.find((l) => l.table.includes(userClubId))!
  const userPosition = userOutcome.table.indexOf(userClubId) + 1
  const verdict = userOutcome.promoted.includes(userClubId)
    ? 'Acesso conquistado!'
    : userOutcome.relegated.includes(userClubId)
      ? 'Rebaixado.'
      : userPosition === 1
        ? 'Campeão!'
        : 'Temporada encerrada.'

  return (
    <div className="flex flex-col gap-4">
      <section className="flex flex-col gap-2 rounded bg-green-950/60 p-4">
        <h2 className="text-2xl font-bold">{verdict}</h2>
        <p className="text-green-100">
          {world.clubs[userClubId].name} terminou em {userPosition}º lugar na{' '}
          {divisionName(userOutcome.division)} {summary.year} e recebe{' '}
          {formatMoney(summary.prizes[userClubId])} de premiação.
        </p>
        <button
          type="button"
          onClick={() => setGame(startNextSeason(game))}
          className="self-start rounded bg-yellow-400 px-4 py-2 font-semibold text-green-950"
        >
          Iniciar temporada {summary.year + 1}
        </button>
      </section>
      <div className="grid gap-4 md:grid-cols-2">
        {summary.leagues.map((outcome) => (
          <section
            key={outcome.leagueId}
            className="flex flex-col gap-2 rounded bg-green-950/60 p-4"
          >
            <h2 className="font-semibold">{divisionName(outcome.division)}</h2>
            <p className="text-sm">
              Campeão: <ClubName club={world.clubs[outcome.table[0]]} />
            </p>
            {outcome.topScorer && (
              <p className="text-sm">
                Artilheiro: {world.players[outcome.topScorer.playerId].name} (
                {world.clubs[outcome.topScorer.clubId].shortName}), {outcome.topScorer.goals} gols
              </p>
            )}
            {outcome.promoted.length > 0 && (
              <ClubList title="Sobem" ids={outcome.promoted} game={game} />
            )}
            {outcome.relegated.length > 0 && (
              <ClubList title="Caem" ids={outcome.relegated} game={game} />
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

function ClubList(props: { title: string; ids: string[]; game: GameState }) {
  return (
    <div className="text-sm">
      <h3 className="text-green-300">{props.title}</h3>
      <ul>
        {props.ids.map((id) => (
          <li key={id}>
            <ClubName club={props.game.world.clubs[id]} highlight={id === props.game.userClubId} />
          </li>
        ))}
      </ul>
    </div>
  )
}
