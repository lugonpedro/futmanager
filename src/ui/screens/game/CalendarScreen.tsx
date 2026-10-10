import { useState } from 'react'
import { Card } from '@/components/ui/card'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { Fixture } from '../../../engine/model/types.ts'
import { leagueOf, userFixture } from '../../../engine/season/season.ts'
import { useGame } from '../../../store/game.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { DivisionPicker } from './DivisionPicker.tsx'
import { FixtureLine } from './FixtureLine.tsx'

const OUTCOME_STYLE = {
  V: 'text-green-600 dark:text-green-400',
  E: 'text-muted-foreground',
  D: 'text-red-600 dark:text-red-400',
}

export function CalendarScreen() {
  const game = useGame()
  const { season, world, userClubId } = game
  const [leagueId, setLeagueId] = useState(() => leagueOf(world, userClubId))
  const [round, setRound] = useState(() => Math.min(season.round, season.totalRounds))
  const rounds = Array.from({ length: season.totalRounds }, (_, i) => i + 1)
  const ownFixtures = rounds
    .map((r) => userFixture(game, r))
    .filter((f): f is Fixture => f !== undefined)

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card className="gap-2 px-3">
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
            const outcome =
              scored === undefined
                ? undefined
                : scored > conceded!
                  ? 'V'
                  : scored === conceded
                    ? 'E'
                    : 'D'
            return (
              <li key={fixture.id}>
                <button
                  type="button"
                  onClick={() => setRound(fixture.round)}
                  className={`grid w-full grid-cols-[2.5rem_1.5rem_1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-left cursor-pointer hover:bg-accent ${fixture.round === season.round ? 'bg-highlight-soft' : ''}`}
                >
                  <span className="text-muted-foreground tabular-nums">{fixture.round}ª</span>
                  <span className="text-xs text-muted-foreground" title={home ? 'Em casa' : 'Fora'}>
                    {home ? 'C' : 'F'}
                  </span>
                  <ClubName club={opponent} />
                  <span className={`tabular-nums ${outcome ? OUTCOME_STYLE[outcome] : ''}`}>
                    {outcome ? `${outcome} ${scored}-${conceded}` : ''}
                  </span>
                </button>
              </li>
            )
          })}
        </ol>
      </Card>

      <Card className="gap-3 self-start px-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DivisionPicker leagues={world.leagues} value={leagueId} onChange={setLeagueId} />
          <div className="flex items-center gap-2 text-sm">
            Rodada
            <Select value={String(round)} onValueChange={(value) => setRound(Number(value))}>
              <SelectTrigger size="sm" aria-label="Rodada">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="max-h-72">
                {rounds.map((r) => (
                  <SelectItem key={r} value={String(r)}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <ul className="flex flex-col gap-1">
          {season.fixtures[leagueId][round - 1].map((fixture) => (
            <li key={fixture.id}>
              <FixtureLine fixture={fixture} world={world} userClubId={userClubId} />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
