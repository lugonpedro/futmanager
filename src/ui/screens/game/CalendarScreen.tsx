import { useState } from 'react'
import type { Fixture } from '../../../engine/model/types.ts'
import { leagueOf, userFixture } from '../../../engine/season/season.ts'
import { useGame } from '../../../store/game.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { DivisionPicker } from './DivisionPicker.tsx'
import { FixtureLine } from './FixtureLine.tsx'

const OUTCOME_STYLE = { V: 'text-green-300', E: 'text-gray-300', D: 'text-red-300' }

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
      <section className="flex flex-col gap-2 rounded bg-green-950/60 p-3">
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
                  className={`grid w-full grid-cols-[2.5rem_1.5rem_1fr_auto] items-center gap-2 rounded px-1 py-0.5 text-left hover:bg-green-800 ${fixture.round === season.round ? 'bg-green-700/60' : ''}`}
                >
                  <span className="text-green-300 tabular-nums">{fixture.round}ª</span>
                  <span className="text-xs text-green-300" title={home ? 'Em casa' : 'Fora'}>
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
      </section>

      <section className="flex flex-col gap-3 rounded bg-green-950/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DivisionPicker leagues={world.leagues} value={leagueId} onChange={setLeagueId} />
          <label className="flex items-center gap-2 text-sm">
            Rodada
            <select
              className="rounded bg-green-800 p-1"
              value={round}
              onChange={(e) => setRound(Number(e.target.value))}
            >
              {rounds.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
        </div>
        <ul className="flex flex-col gap-1">
          {season.fixtures[leagueId][round - 1].map((fixture) => (
            <li key={fixture.id}>
              <FixtureLine fixture={fixture} world={world} userClubId={userClubId} />
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
