import { useState } from 'react'
import { FastForwardIcon, PlayIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { objectiveText, takeJob } from '../../../engine/career/board.ts'
import type { Fixture, GameState } from '../../../engine/model/types.ts'
import { CUP_NAME, cupProgress, nextCupTie, tieWinner } from '../../../engine/season/cup.ts'
import {
  clubLineup,
  isSeasonOver,
  leagueOf,
  leagueScorers,
  leagueStandings,
  seasonReview,
  seasonSummary,
  startNextSeason,
  userFixture,
} from '../../../engine/season/season.ts'
import { squadOf } from '../../../engine/transfer/market.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { simulateRounds } from '../../../worker/simulate.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { ConfidenceBar } from '../../components/Confidence.tsx'
import { divisionName, formatMoney, POSTURE_NAMES } from '../../format.ts'
import { competitionsPath, CUP_SLUG } from '../../routes.ts'
import { FixtureLine } from './FixtureLine.tsx'

export function OverviewScreen() {
  const game = useGame()
  if (isSeasonOver(game.season)) return <SeasonEnd game={game} />
  if (game.career.status === 'demitido') return <Fired game={game} />
  return <NextRound game={game} />
}

/** Sacked mid-season: the manager picks one of the clubs that called before the season goes on. */
function Fired({ game }: { game: GameState }) {
  const setGame = useGameStore((s) => s.setGame)
  const club = game.world.clubs[game.userClubId]
  return (
    <Card className="gap-3 px-4">
      <h2 className="text-2xl font-bold">Você foi demitido</h2>
      <p>
        A diretoria do {club.name} perdeu a paciência depois da rodada {game.season.round - 1}.
        Estes clubes querem você para o resto da temporada:
      </p>
      <JobOffers
        game={game}
        offers={game.career.jobOffers}
        onPick={(id) => setGame(takeJob(game, id))}
      />
    </Card>
  )
}

/** Clubs inviting the manager, each with a button to take the job. */
function JobOffers(props: { game: GameState; offers: string[]; onPick: (clubId: string) => void }) {
  const { world } = props.game
  return (
    <ul className="flex flex-col gap-2">
      {props.offers.map((id) => {
        const club = world.clubs[id]
        const table = leagueStandings(props.game, leagueOf(world, id))
        const position = table.findIndex((row) => row.clubId === id) + 1
        return (
          <li
            key={id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-2"
          >
            <span className="flex min-w-0 flex-col">
              <ClubName club={club} />
              <span className="text-xs text-muted-foreground">
                {divisionName(club.division)}, {position}º lugar, caixa {formatMoney(club.cash)}
              </span>
            </span>
            <Button size="sm" onClick={() => props.onPick(id)}>
              Assumir
            </Button>
          </li>
        )
      })}
    </ul>
  )
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
        <CupLine game={game} />
        <p className="text-sm text-muted-foreground">
          Escalação: {lineup.formation}, postura {POSTURE_NAMES[lineup.posture].toLowerCase()}.{' '}
          <Link to="/jogo/time" className="text-primary underline">
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

      <Notices game={game} />
      <NewSeason game={game} />

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
        <p className="text-sm">
          Meta da diretoria: {objectiveText(world, userClubId, game.career.target).toLowerCase()}.{' '}
          <Link to="/jogo/clube/diretoria" className="text-primary underline">
            Diretoria
          </Link>
        </p>
        <ConfidenceBar confidence={game.career.confidence} />
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
        <LastCupTie game={game} />
        <TopScorers game={game} leagueId={leagueId} />
      </Card>
    </div>
  )
}

function SeasonEnd({ game }: { game: GameState }) {
  const setGame = useGameStore((s) => s.setGame)
  const summary = seasonSummary(game)
  const review = seasonReview(game)
  const { world, userClubId } = game
  const club = world.clubs[userClubId]
  const campaign = game.season.cup && cupProgress(game.season.cup, userClubId)
  const final = game.season.cup?.stages.at(-1)?.ties[0]

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
        {review.fired ? (
          <p className="text-destructive">
            {game.career.status === 'demitido'
              ? `Você foi demitido do ${club.name} durante a temporada.`
              : `A diretoria do ${club.name} decidiu não continuar com você.`}
          </p>
        ) : (
          <p className="text-sm">
            Meta: {objectiveText(world, userClubId, review.target).toLowerCase()} (até o{' '}
            {review.target}º). {review.position <= review.target ? 'Cumprida.' : 'Não cumprida.'}{' '}
            Confiança da diretoria: {review.confidence}%.
          </p>
        )}
        {!review.fired && <ExpiringWarning game={game} />}
        {review.offers.length > 0 && (
          <>
            <h3 className="mt-2 font-semibold">
              {review.fired ? 'Clubes interessados em você' : 'Propostas de outros clubes'}
            </h3>
            <JobOffers
              game={game}
              offers={review.offers}
              onPick={(id) => setGame(startNextSeason(game, id))}
            />
          </>
        )}
        {!review.fired && (
          <Button className="self-start" onClick={() => setGame(startNextSeason(game))}>
            Iniciar temporada {summary.year + 1}
            {review.offers.length > 0 && ` no ${club.shortName}`}
          </Button>
        )}
      </Card>
      {final?.result && (
        <Card className="gap-1 px-4">
          <h2 className="font-semibold">{CUP_NAME}</h2>
          <p className="text-sm">
            Campeão: <ClubName club={world.clubs[tieWinner(final)!]} />
          </p>
          <p className="text-sm text-muted-foreground">Final</p>
          <FixtureLine fixture={final} world={world} userClubId={userClubId} />
          {campaign && <p className="text-sm text-muted-foreground">Sua campanha: {campaign}.</p>}
        </Card>
      )}
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

/** The user's cup tie for midweek, if one follows this round. */
function CupLine({ game }: { game: GameState }) {
  const { season, world, userClubId } = game
  const tie = nextCupTie(season.cup, userClubId)
  if (!tie || tie.round !== season.round) return null
  const stage = season.cup!.stages.find((s) => s.ties.includes(tie))!
  const home = tie.homeId === userClubId
  return (
    <p className="flex flex-wrap items-center gap-1 text-sm">
      No meio da semana, {CUP_NAME} ({stage.name.toLowerCase()}), {home ? 'em casa' : 'fora'} contra{' '}
      <ClubName club={world.clubs[home ? tie.awayId : tie.homeId]} />
    </p>
  )
}

/** The user's cup tie played after the last round, if there was one. */
function LastCupTie({ game }: { game: GameState }) {
  const { season, world, userClubId } = game
  const stage = season.cup?.stages.find((s) => s.round === season.round - 1)
  const tie: Fixture | undefined = stage?.ties.find(
    (t) => t.result && (t.homeId === userClubId || t.awayId === userClubId),
  )
  if (!stage || !tie) return null
  return (
    <div className="mt-2 flex flex-col gap-1">
      <h3 className="text-sm font-semibold">
        <Link to={`/jogo/competicoes/${CUP_SLUG}`} className="underline">
          {CUP_NAME}
        </Link>
        , {stage.name.toLowerCase()}
      </h3>
      <FixtureLine fixture={tie} world={world} userClubId={userClubId} />
    </div>
  )
}

/** The three leading scorers of the user's division. */
function TopScorers({ game, leagueId }: { game: GameState; leagueId: string }) {
  const { world, userClubId } = game
  const top = leagueScorers(game, leagueId).slice(0, 3)
  if (top.length === 0) return null
  return (
    <div className="mt-2 flex flex-col gap-1">
      <h3 className="text-sm font-semibold">
        <Link to={competitionsPath(game, 'artilharia')} className="underline">
          Artilharia
        </Link>
      </h3>
      <ol className="text-sm">
        {top.map((row, i) => (
          <li key={row.playerId} className="flex items-center gap-2">
            <span className="w-4 text-right text-muted-foreground tabular-nums">{i + 1}</span>
            <span className="min-w-0 flex-1 truncate">
              {world.players[row.playerId].name}{' '}
              <span className="text-xs text-muted-foreground">
                {world.clubs[row.clubId].shortName}
              </span>
            </span>
            <span
              className={`font-semibold tabular-nums ${row.clubId === userClubId ? 'text-highlight' : ''}`}
            >
              {row.goals}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** At the first round: who came up from the academy and who retired over the break. */
function NewSeason({ game }: { game: GameState }) {
  const { season, world, userClubId, history, career } = game
  const last = history.at(-1)
  if (season.round !== 1 || !last) return null
  const youth = (last.userYouth ?? [])
    .map((id) => world.players[id])
    .filter((p) => p.clubId === userClubId)
  const stayed = career.history.at(-1)?.clubId === userClubId
  const retired = stayed ? (last.userRetired ?? []).map((id) => world.players[id]) : []
  if (youth.length === 0 && retired.length === 0) return null
  return (
    <Card className="gap-1 px-4 md:col-span-2">
      <h2 className="font-semibold">Novidades no elenco</h2>
      {youth.length > 0 && (
        <p className="text-sm">
          Subiram da base:{' '}
          {youth
            .map(
              (p) =>
                `${p.name} (${p.position}, ${p.age} anos, força ${p.strength}, potencial ${p.potential})`,
            )
            .join('; ')}
          .
        </p>
      )}
      {retired.length > 0 && (
        <p className="text-sm text-muted-foreground">
          Se aposentaram:{' '}
          {retired.map((p) => `${p.name} (${p.position}, ${p.age} anos)`).join(', ')}.
        </p>
      )}
    </Card>
  )
}

function expiringPlayers(game: GameState) {
  return squadOf(game.world, game.userClubId).filter((p) => p.contractUntil <= game.season.year)
}

/** Things that need the manager: bids waiting, contracts running out, money running out. */
function Notices({ game }: { game: GameState }) {
  const offers = game.market.offers.length
  const expiring = expiringPlayers(game).length
  const cash = game.world.clubs[game.userClubId].cash
  const shaky = game.career.confidence < 25
  if (offers === 0 && expiring === 0 && cash >= 0 && !shaky) return null
  return (
    <Card className="gap-1 border-highlight px-4 md:col-span-2">
      {offers > 0 && (
        <p className="text-sm">
          <Link to="/jogo/mercado/propostas" className="font-semibold text-primary underline">
            {offers} {offers === 1 ? 'proposta' : 'propostas'}
          </Link>{' '}
          por jogadores seus, válidas até a próxima rodada.
        </p>
      )}
      {expiring > 0 && (
        <p className="text-sm">
          {expiring} {expiring === 1 ? 'contrato termina' : 'contratos terminam'} no fim da
          temporada.{' '}
          <Link to="/jogo/time" className="text-primary underline">
            Renovar
          </Link>
        </p>
      )}
      {shaky && (
        <p className="text-sm text-destructive">
          A diretoria está perdendo a paciência. Se a confiança chegar a zero, você é demitido.{' '}
          <Link to="/jogo/clube/diretoria" className="underline">
            Diretoria
          </Link>
        </p>
      )}
      {cash < 0 && (
        <p className="text-sm text-destructive">
          Caixa negativo: {formatMoney(cash)}. Venda jogadores ou ajuste o ingresso em{' '}
          <Link to="/jogo/clube/estadio" className="underline">
            Estádio
          </Link>
          .
        </p>
      )}
    </Card>
  )
}

function ExpiringWarning({ game }: { game: GameState }) {
  const players = expiringPlayers(game)
  if (players.length === 0) return null
  return (
    <p className="text-sm text-muted-foreground">
      Ao iniciar a nova temporada saem de graça, por fim de contrato:{' '}
      {players.map((p) => `${p.name} (${p.position}, ${p.strength})`).join(', ')}.{' '}
      <Link to="/jogo/time" className="text-primary underline">
        Renovar antes
      </Link>
    </p>
  )
}
