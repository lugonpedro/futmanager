import { useState } from 'react'
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
        <p className="text-green-200">Nenhum gol marcado ainda.</p>
      ) : (
        <table className="w-full rounded bg-green-950/60 text-sm tabular-nums">
          <thead className="text-green-300">
            <tr>
              <th className="px-2 py-2 text-right">#</th>
              <th className="px-2 text-left">Jogador</th>
              <th className="px-2 text-left">Clube</th>
              <th className="px-2">Gols</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.playerId}
                className={`border-t border-green-900 ${row.clubId === game.userClubId ? 'bg-green-700/50' : ''}`}
              >
                <td className="px-2 py-1 text-right">
                  {i > 0 && rows[i - 1].goals === row.goals ? '' : i + 1}
                </td>
                <td className="px-2">
                  {players[row.playerId].name}{' '}
                  <span className="text-xs text-green-300">{players[row.playerId].position}</span>
                </td>
                <td className="max-w-40 px-2">
                  <ClubName club={clubs[row.clubId]} />
                </td>
                <td className="px-2 text-center font-bold">{row.goals}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  )
}
