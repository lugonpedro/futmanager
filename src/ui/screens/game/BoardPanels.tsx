import { Link } from 'react-router'
import { Card } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { BOARD, objectiveText } from '../../../engine/career/board.ts'
import type { CareerSeason } from '../../../engine/model/types.ts'
import { isSeasonOver, seasonReview } from '../../../engine/season/season.ts'
import { useGame } from '../../../store/game.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { ConfidenceBar } from '../../components/Confidence.tsx'
import { divisionName } from '../../format.ts'

function verdict(season: CareerSeason) {
  if (season.fired) return <span className="text-destructive">Demitido</span>
  return season.position <= season.target ? (
    <span className="text-green-600 dark:text-green-400">Meta cumprida</span>
  ) : (
    <span className="text-muted-foreground">Meta não cumprida</span>
  )
}

/** What the board expects, how much it still trusts the manager and who wants to hire him. */
export function BoardPanel() {
  const game = useGame()
  const { career, world, userClubId, season } = game
  const club = world.clubs[userClubId]
  // The same offers the Resumo shows: the end-of-season ones first, then those after a sacking.
  const offers = isSeasonOver(season)
    ? seasonReview(game).offers
    : career.status === 'demitido'
      ? career.jobOffers
      : []

  return (
    <div className="flex flex-col gap-4">
      <Card className="gap-2 px-4">
        <h3 className="font-semibold">Meta e confiança</h3>
        {career.status === 'demitido' ? (
          <p className="text-sm text-destructive">
            Você foi demitido do {club.name}. Escolha um novo clube no Resumo.
          </p>
        ) : (
          <>
            <p className="text-sm">
              Meta do {club.name} para {season.year}:{' '}
              <strong>{objectiveText(world, userClubId, career.target).toLowerCase()}</strong>.
            </p>
            <ConfidenceBar confidence={career.confidence} />
          </>
        )}
        <p className="text-sm text-muted-foreground">
          Vitórias aumentam a confiança e derrotas diminuem. A partir da rodada {BOARD.pressureFrom}
          , a diretoria também olha a tabela: ficar muito abaixo da meta pesa toda rodada. Se a
          confiança chegar a zero, você é demitido. No fim da temporada, cumprir a meta dá um bom
          crédito, e uma campanha forte atrai propostas de clubes maiores.
        </p>
      </Card>

      <Card className="gap-2 px-4">
        <h3 className="font-semibold">Propostas de emprego</h3>
        {offers.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma no momento. Os outros clubes fazem propostas no fim da temporada, olhando a sua
            campanha.
          </p>
        ) : (
          <>
            <ul className="text-sm">
              {offers.map((id) => (
                <li key={id}>
                  <ClubName club={world.clubs[id]} />{' '}
                  <span className="text-muted-foreground">
                    ({divisionName(world.clubs[id].division)})
                  </span>
                </li>
              ))}
            </ul>
            <p className="text-sm">
              <Link to="/jogo" className="text-primary underline">
                Decida no Resumo
              </Link>
              .
            </p>
          </>
        )}
      </Card>
    </div>
  )
}

/** Every finished season of the career, at whichever club. */
export function HistoryPanel() {
  const { career, world } = useGame()
  return (
    <Card className="gap-2 px-3">
      <h2 className="px-1 font-semibold">Histórico</h2>
      {career.history.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          Sua primeira temporada ainda está em andamento.
        </p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Ano</TableHead>
              <TableHead>Clube</TableHead>
              <TableHead className="text-right">Posição</TableHead>
              <TableHead className="text-right">Meta</TableHead>
              <TableHead>Copa</TableHead>
              <TableHead>Resultado</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[...career.history].reverse().map((season) => (
              <TableRow key={`${season.year}-${season.clubId}`}>
                <TableCell className="tabular-nums">{season.year}</TableCell>
                <TableCell className="max-w-48">
                  <ClubName club={world.clubs[season.clubId]} />
                  <span className="block text-xs text-muted-foreground">
                    {divisionName(season.division)}
                  </span>
                </TableCell>
                <TableCell className="text-right tabular-nums">{season.position}º</TableCell>
                <TableCell className="text-right tabular-nums">até {season.target}º</TableCell>
                <TableCell className="text-sm">{season.cup ?? '-'}</TableCell>
                <TableCell className="text-sm">{verdict(season)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </Card>
  )
}
