import { Link } from 'react-router'
import { Card } from '@/components/ui/card'
import type { Fixture } from '../../../engine/model/types.ts'
import { CUP_ID, tieWinner } from '../../../engine/season/cup.ts'
import { userFixture } from '../../../engine/season/season.ts'
import { useGame } from '../../../store/game.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { competitionsPath, CUP_SLUG } from '../../routes.ts'

const OUTCOME_STYLE = {
  V: 'text-green-600 dark:text-green-400',
  E: 'text-muted-foreground',
  D: 'text-red-600 dark:text-red-400',
}

/** The user's own games of the season, league and cup, each linking to its round. */
export function CalendarScreen() {
  const game = useGame()
  const { season, world, userClubId } = game
  const rounds = Array.from({ length: season.totalRounds }, (_, i) => i + 1)
  const cupTies = (season.cup?.stages ?? []).flatMap((s) =>
    s.ties.filter((t) => t.homeId === userClubId || t.awayId === userClubId),
  )
  // Cup ties are played in midweek, right after the league round they follow.
  const ownFixtures = rounds
    .flatMap((r) => [userFixture(game, r), ...cupTies.filter((t) => t.round === r)])
    .filter((f): f is Fixture => f !== undefined)

  return (
    <Card className="max-w-2xl gap-2 px-3">
      <h2 className="font-semibold">Seus jogos</h2>
      <ol className="flex flex-col text-sm">
        {ownFixtures.map((fixture) => {
          const home = fixture.homeId === userClubId
          const opponent = world.clubs[home ? fixture.awayId : fixture.homeId]
          const { result } = fixture
          const [scored, conceded] = result
            ? home
              ? [result.homeGoals, result.awayGoals]
              : [result.awayGoals, result.homeGoals]
            : []
          const cup = fixture.leagueId === CUP_ID
          const outcome =
            scored === undefined
              ? undefined
              : scored > conceded! ||
                  (cup && scored === conceded && tieWinner(fixture) === userClubId)
                ? 'V'
                : scored === conceded && !cup
                  ? 'E'
                  : 'D'
          const stage = cup && season.cup?.stages.find((st) => st.ties.includes(fixture))
          const to = stage
            ? `/jogo/competicoes/${CUP_SLUG}/jogos?fase=${encodeURIComponent(stage.name)}`
            : `${competitionsPath(game, 'jogos')}?rodada=${fixture.round}`
          return (
            <li key={fixture.id}>
              <Link
                to={to}
                title={cup ? 'Ver a fase da copa' : `Ver a ${fixture.round}ª rodada`}
                className={`grid w-full grid-cols-[2.5rem_1.5rem_1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-left cursor-pointer hover:bg-accent ${fixture.round === season.round ? 'bg-highlight-soft' : ''}`}
              >
                <span className="text-muted-foreground tabular-nums">
                  {cup ? 'Copa' : `${fixture.round}ª`}
                </span>
                <span className="text-xs text-muted-foreground" title={home ? 'Em casa' : 'Fora'}>
                  {home ? 'C' : 'F'}
                </span>
                <ClubName club={opponent} />
                <span className={`tabular-nums ${outcome ? OUTCOME_STYLE[outcome] : ''}`}>
                  {outcome
                    ? `${outcome} ${scored}-${conceded}${result?.penalties ? ' pên.' : ''}`
                    : ''}
                </span>
              </Link>
            </li>
          )
        })}
      </ol>
    </Card>
  )
}
