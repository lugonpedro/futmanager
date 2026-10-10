import { useState } from 'react'
import { FastForwardIcon, PlayIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
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
      <Card className="gap-3 px-4 md:col-span-2">
        <h2 className="text-sm text-muted-foreground">
          Próximo jogo · rodada {season.round} de {season.totalRounds}
        </h2>
        {fixture && (
          <div className="text-lg">
            <FixtureLine fixture={fixture} world={world} userClubId={userClubId} />
          </div>
        )}
        <p className="text-sm text-muted-foreground">
          Escalação: {lineup.formation}, postura {POSTURE_NAMES[lineup.posture].toLowerCase()}.{' '}
          <Link to="/jogo/escalacao" className="text-primary underline">
            Mudar
          </Link>
        </p>
        <div className="flex flex-wrap gap-2">
          <Button asChild className={busy ? 'pointer-events-none opacity-50' : undefined}>
            <Link to="/jogo/partida">
              <PlayIcon />
              Jogar ao vivo
            </Link>
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => simulate(1)}>
            <FastForwardIcon />
            Simular rodada
          </Button>
          <Button variant="outline" disabled={busy} onClick={() => simulate(season.totalRounds)}>
            Simular até o fim da temporada
          </Button>
          {busy && <span className="self-center text-sm text-muted-foreground">Simulando...</span>}
        </div>
      </Card>

      <Card className="gap-2 px-4">
        <h2 className="font-semibold">
          {table[position - 1].played === 0
            ? divisionName(world.clubs[userClubId].division)
            : `${position}º lugar na ${divisionName(world.clubs[userClubId].division)}`}
        </h2>
        <p className="text-sm text-muted-foreground">
          {table[position - 1].played === 0
            ? 'Ainda sem jogos na temporada.'
            : `${table[position - 1].points} pontos em ${table[position - 1].played} ${table[position - 1].played === 1 ? 'jogo' : 'jogos'}.`}
        </p>
        <h3 className="mt-2 text-sm font-semibold">Desfalques</h3>
        {out.length === 0 ? (
          <p className="text-sm text-muted-foreground">Elenco completo.</p>
        ) : (
          <ul className="text-sm">
            {out.map(({ id, rounds, why }) => (
              <li key={`${id}-${why}`}>
                {world.players[id].name}{' '}
                <span className="text-muted-foreground">
                  ({world.players[id].position}), {why}, volta em {rounds}{' '}
                  {rounds === 1 ? 'rodada' : 'rodadas'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card className="gap-2 px-4">
        <h2 className="font-semibold">
          {lastRound.length ? `Resultados da rodada ${season.round - 1}` : 'Primeira rodada'}
        </h2>
        {lastRound.length === 0 ? (
          <p className="text-sm text-muted-foreground">A temporada {season.year} vai começar.</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {lastRound.map((f) => (
              <li key={f.id}>
                <FixtureLine fixture={f} world={world} userClubId={userClubId} />
              </li>
            ))}
          </ul>
        )}
      </Card>
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
      <Card className="gap-2 px-4">
        <h2 className="text-2xl font-bold">{verdict}</h2>
        <p>
          {world.clubs[userClubId].name} terminou em {userPosition}º lugar na{' '}
          {divisionName(userOutcome.division)} {summary.year} e recebe{' '}
          {formatMoney(summary.prizes[userClubId])} de premiação.
        </p>
        <Button className="self-start" onClick={() => setGame(startNextSeason(game))}>
          Iniciar temporada {summary.year + 1}
        </Button>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {summary.leagues.map((outcome) => (
          <Card key={outcome.leagueId} className="gap-2 px-4">
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
          </Card>
        ))}
      </div>
    </div>
  )
}

function ClubList(props: { title: string; ids: string[]; game: GameState }) {
  return (
    <div className="text-sm">
      <h3 className="text-muted-foreground">{props.title}</h3>
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
