import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { ScorerRow } from '../../../engine/season/standings.ts'
import { useGame } from '../../../store/game.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { Pager } from '../../components/Pager.tsx'
import { usePage } from '../../usePage.ts'

const PAGE_SIZE = 20

/** The top scorers of a competition, ties sharing a place. */
export function ScorersTable(props: { scorers: readonly ScorerRow[] }) {
  const game = useGame()
  const { players, clubs } = game.world
  const rows = props.scorers
  const paged = usePage(rows, PAGE_SIZE)

  return (
    <section className="flex flex-col gap-3">
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
              {paged.items.map((row, shown) => {
                const i = paged.start + shown
                return (
                  <TableRow
                    key={row.playerId}
                    className={row.clubId === game.userClubId ? 'bg-highlight-soft' : undefined}
                  >
                    <TableCell className="text-right">
                      {shown > 0 && rows[i - 1].goals === row.goals ? '' : i + 1}
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
                )
              })}
            </TableBody>
          </Table>
        </Card>
      )}
      <Pager paged={paged} />
    </section>
  )
}
