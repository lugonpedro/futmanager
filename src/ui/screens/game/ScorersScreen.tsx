import { useState } from 'react'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { leagueOf, leagueScorers } from '../../../engine/season/season.ts'
import { useGame } from '../../../store/game.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { DivisionPicker } from './DivisionPicker.tsx'

const SHOWN = 20

export function ScorersScreen() {
  const game = useGame()
  const { leagues, players, clubs } = game.world
  const [leagueId, setLeagueId] = useState(() => leagueOf(game.world, game.userClubId))
  const rows = leagueScorers(game, leagueId).slice(0, SHOWN)

  return (
    <section className="flex flex-col gap-3">
      <DivisionPicker leagues={leagues} value={leagueId} onChange={setLeagueId} />
      {rows.length === 0 ? (
        <p className="text-muted-foreground">Nenhum gol marcado ainda.</p>
      ) : (
        <Card className="py-0">
          <Table className="tabular-nums">
            <TableHeader>
              <TableRow>
                <TableHead className="text-right">#</TableHead>
                <TableHead>Jogador</TableHead>
                <TableHead>Clube</TableHead>
                <TableHead className="text-center">Gols</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow
                  key={row.playerId}
                  className={row.clubId === game.userClubId ? 'bg-highlight-soft' : undefined}
                >
                  <TableCell className="text-right">
                    {i > 0 && rows[i - 1].goals === row.goals ? '' : i + 1}
                  </TableCell>
                  <TableCell>
                    {players[row.playerId].name}{' '}
                    <span className="text-xs text-muted-foreground">
                      {players[row.playerId].position}
                    </span>
                  </TableCell>
                  <TableCell className="max-w-40">
                    <ClubName club={clubs[row.clubId]} />
                  </TableCell>
                  <TableCell className="text-center font-bold">{row.goals}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}
    </section>
  )
}
