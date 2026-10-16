import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { cn } from '@/lib/utils'
import { leagueStandings, PROMOTION_SPOTS } from '../../../engine/season/season.ts'
import type { Outcome } from '../../../engine/season/standings.ts'
import { useGame } from '../../../store/game.ts'
import { ClubLink } from './ClubSheet.tsx'

const FORM_STYLE: Record<Outcome, string> = {
  V: 'bg-green-500',
  E: 'bg-gray-400',
  D: 'bg-red-500',
}

const COLUMNS: { label: string; title: string; hide?: string }[] = [
  { label: 'Pts', title: 'Pontos' },
  { label: 'J', title: 'Jogos' },
  { label: 'V', title: 'Vitórias' },
  { label: 'E', title: 'Empates' },
  { label: 'D', title: 'Derrotas' },
  { label: 'GP', title: 'Gols pró', hide: 'hidden sm:table-cell' },
  { label: 'GC', title: 'Gols contra', hide: 'hidden sm:table-cell' },
  { label: 'SG', title: 'Saldo de gols' },
]

/** A division's table, with promotion and relegation spots marked. */
export function StandingsTable({ leagueId }: { leagueId: string }) {
  const game = useGame()
  const { leagues } = game.world
  const index = leagues.findIndex((league) => league.id === leagueId)
  const rows = leagueStandings(game, leagueId)
  const goesUp = (position: number) => index > 0 && position < PROMOTION_SPOTS
  const goesDown = (position: number) =>
    index < leagues.length - 1 && position >= rows.length - PROMOTION_SPOTS

  return (
    <section className="flex flex-col gap-3">
      <Card className="py-0">
        <Table className="tabular-nums">
          <TableHeader>
            <TableRow>
              <TableHead className="text-right">#</TableHead>
              <TableHead>Clube</TableHead>
              {COLUMNS.map((c) => (
                <TableHead key={c.label} title={c.title} className={cn('text-center', c.hide)}>
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="hidden md:table-cell">Últimos</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <TableRow
                key={row.clubId}
                className={row.clubId === game.userClubId ? 'bg-highlight-soft' : undefined}
              >
                <TableCell
                  className={cn(
                    'border-l-4 text-right',
                    goesUp(i)
                      ? 'border-blue-500'
                      : goesDown(i)
                        ? 'border-red-500'
                        : i === 0
                          ? 'border-yellow-400'
                          : 'border-transparent',
                  )}
                >
                  {i + 1}
                </TableCell>
                <TableCell className="max-w-40">
                  <ClubLink clubId={row.clubId} highlight={row.clubId === game.userClubId} />
                </TableCell>
                <TableCell className="text-center font-bold">{row.points}</TableCell>
                <TableCell className="text-center">{row.played}</TableCell>
                <TableCell className="text-center">{row.wins}</TableCell>
                <TableCell className="text-center">{row.draws}</TableCell>
                <TableCell className="text-center">{row.losses}</TableCell>
                <TableCell className="hidden text-center sm:table-cell">{row.goalsFor}</TableCell>
                <TableCell className="hidden text-center sm:table-cell">
                  {row.goalsAgainst}
                </TableCell>
                <TableCell className="text-center">{row.goalDifference}</TableCell>
                <TableCell className="hidden md:table-cell">
                  <span className="flex gap-1">
                    {row.form.map((outcome, j) => (
                      <span
                        key={j}
                        title={outcome}
                        className={`inline-block h-2.5 w-2.5 rounded-full ${FORM_STYLE[outcome]}`}
                      />
                    ))}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      <p className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        {index === 0 && (
          <span>
            <span className="text-yellow-400">■</span> Campeão
          </span>
        )}
        {index > 0 && (
          <span>
            <span className="text-blue-500">■</span> Acesso
          </span>
        )}
        {index < leagues.length - 1 && (
          <span>
            <span className="text-red-500">■</span> Rebaixamento
          </span>
        )}
        <span>Desempate: vitórias, saldo, gols pró, confronto direto, cartões.</span>
      </p>
    </section>
  )
}
