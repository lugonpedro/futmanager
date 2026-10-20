import { useCallback, useEffect, useMemo, useState } from 'react'
import { TrophyIcon } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  loadDraftPicks,
  loadDraftPool,
  loadDraftTeams,
  loadRoomSummary,
  watchRoom,
  type DraftPick,
  type DraftTeam,
} from '../../cloud/draft.ts'
import type { Room } from '../../cloud/rooms.ts'
import type { PoolPlayer } from '../../engine/room/start.ts'
import type { RoomMatchLine, RoomSummary } from '../../engine/room/summary.ts'
import { DraftBoard } from './Draft.tsx'
import { PlayRoundButton } from './PlayRoundButton.tsx'
import { TeamCrest } from './RoomParts.tsx'

type Loaded = {
  teams: DraftTeam[]
  pool: PoolPlayer[]
  picks: DraftPick[]
  summary?: RoomSummary
}

/** The room's league: the table, the last round, the next one and the squads. */
export function LeagueView(props: { room: Room; userId: string; reload: () => Promise<void> }) {
  const { room, userId, reload } = props
  const [loaded, setLoaded] = useState<Loaded>()
  const [failed, setFailed] = useState(false)

  const load = useCallback(
    () =>
      Promise.all([
        loadDraftTeams(room.id),
        loadDraftPool(room.id),
        loadDraftPicks(room.id),
        loadRoomSummary(room.id),
      ]).then(([teams, pool, picks, summary]) => ({ teams, pool, picks, summary })),
    [room.id],
  )
  const loadSummary = useCallback(async () => {
    const summary = await loadRoomSummary(room.id)
    setLoaded((now) => now && { ...now, summary })
  }, [room.id])

  useEffect(() => {
    let live = true
    load()
      .then((found) => live && setLoaded(found))
      .catch(() => live && setFailed(true))
    const stop = watchRoom(room.id, {
      pick: () => {},
      team: () => {},
      room: () => void reload(),
      round: () => void loadSummary(),
    })
    return () => {
      live = false
      stop()
    }
  }, [room.id, load, loadSummary, reload])

  const byId = useMemo(() => new Map((loaded?.pool ?? []).map((p) => [p.id, p])), [loaded])
  if (failed) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">
          Não deu para carregar a liga agora. Atualize a página.
        </CardContent>
      </Card>
    )
  }
  if (!loaded?.summary) {
    return (
      <Card>
        <CardContent className="text-sm text-muted-foreground">Carregando a liga…</CardContent>
      </Card>
    )
  }

  const { teams, picks, summary } = loaded
  const teamOf = new Map(teams.map((t) => [String(t.slot), t]))
  const owner = room.ownerId === userId
  const over = summary.next.length === 0
  const champion = over ? teamOf.get(summary.standings[0]?.teamId) : undefined
  const played = async () => {
    await Promise.all([loadSummary(), reload()])
  }

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            {champion && <TrophyIcon className="size-5 text-highlight" />}
            {champion
              ? `${champion.name} é o campeão!`
              : summary.played === 0
                ? 'A liga vai começar'
                : `Rodada ${summary.played} de ${summary.totalRounds}`}
          </CardTitle>
          <CardDescription>
            {over
              ? `Foram ${summary.totalRounds} rodadas.`
              : owner
                ? 'Cada time joga com a melhor escalação que tem, sem os lesionados e suspensos. Toque no botão quando todos estiverem prontos para ver a rodada.'
                : 'Cada time joga com a melhor escalação que tem, sem os lesionados e suspensos. Quem criou a sala joga as rodadas.'}
          </CardDescription>
        </CardHeader>
        {owner && !over && (
          <CardContent>
            <PlayRoundButton
              room={room.id}
              label={`Jogar a rodada ${summary.played + 1}`}
              onPlayed={played}
            />
          </CardContent>
        )}
      </Card>

      {summary.last.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Resultados da rodada {summary.played}</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-3">
              {summary.last.map((match) => (
                <MatchLine key={`${match.homeId}-${match.awayId}`} match={match} teamOf={teamOf} />
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Tabela</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-6">#</TableHead>
                <TableHead>Time</TableHead>
                <TableHead className="text-right" title="Pontos">
                  P
                </TableHead>
                <TableHead className="text-right" title="Jogos">
                  J
                </TableHead>
                <TableHead className="text-right" title="Vitórias">
                  V
                </TableHead>
                <TableHead className="text-right" title="Empates">
                  E
                </TableHead>
                <TableHead className="text-right" title="Derrotas">
                  D
                </TableHead>
                <TableHead className="text-right" title="Saldo de gols">
                  SG
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {summary.standings.map((row, i) => {
                const team = teamOf.get(row.teamId)
                return (
                  <TableRow key={row.teamId}>
                    <TableCell>{i + 1}</TableCell>
                    <TableCell>
                      <span className="flex items-center gap-2">
                        {team && (
                          <TeamCrest
                            team={team}
                            id={`tabela-${row.teamId}`}
                            className="size-5 shrink-0"
                          />
                        )}
                        <span className="truncate">{team?.name}</span>
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-bold">{row.points}</TableCell>
                    <TableCell className="text-right">{row.played}</TableCell>
                    <TableCell className="text-right">{row.wins}</TableCell>
                    <TableCell className="text-right">{row.draws}</TableCell>
                    <TableCell className="text-right">{row.losses}</TableCell>
                    <TableCell className="text-right">{row.goalsFor - row.goalsAgainst}</TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {summary.next.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Próxima rodada</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="flex flex-col gap-1 text-sm">
              {summary.next.map((match) => (
                <li key={`${match.homeId}-${match.awayId}`} className="flex items-center gap-2">
                  <TeamName team={teamOf.get(match.homeId)} id={`prox-${match.homeId}`} />
                  <span className="text-muted-foreground">x</span>
                  <TeamName team={teamOf.get(match.awayId)} id={`prox-${match.awayId}`} end />
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {summary.scorers.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Artilharia</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="flex flex-col gap-1 text-sm">
              {summary.scorers.map((row, i) => (
                <li key={`${row.name}-${row.teamId}`} className="flex items-center gap-2">
                  <span className="w-5 text-right text-muted-foreground">{i + 1}</span>
                  <span className="min-w-0 flex-1 truncate">{row.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {teamOf.get(row.teamId)?.shortName}
                  </span>
                  <span className="w-6 text-right font-bold">{row.goals}</span>
                </li>
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <DraftBoard room={room} teams={teams} byId={byId} picks={picks} />
    </>
  )
}

function TeamName(props: { team?: DraftTeam; id: string; end?: boolean }) {
  const { team } = props
  return (
    <span
      className={`flex min-w-0 flex-1 items-center gap-2 ${props.end ? 'flex-row-reverse text-right' : ''}`}
    >
      {team && <TeamCrest team={team} id={props.id} className="size-5 shrink-0" />}
      <span className="truncate">{team?.name}</span>
    </span>
  )
}

function MatchLine(props: { match: RoomMatchLine; teamOf: ReadonlyMap<string, DraftTeam> }) {
  const { match, teamOf } = props
  const goals = (teamId: string) =>
    match.goals
      .filter((g) => g.teamId === teamId)
      .sort((a, b) => a.minute - b.minute)
      .map((g) => `${g.name} ${g.minute}'`)
      .join(', ')
  return (
    <li className="flex flex-col gap-0.5">
      <span className="flex items-center gap-2 text-sm">
        <TeamName team={teamOf.get(match.homeId)} id={`res-${match.homeId}`} />
        <span className="shrink-0 font-mono font-bold tabular-nums">
          {match.homeGoals} x {match.awayGoals}
        </span>
        <TeamName team={teamOf.get(match.awayId)} id={`res-${match.awayId}`} end />
      </span>
      <span className="flex justify-between gap-4 text-xs text-muted-foreground">
        <span>{goals(match.homeId)}</span>
        <span className="text-right">{goals(match.awayId)}</span>
      </span>
    </li>
  )
}
