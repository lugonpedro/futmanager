import { useState } from 'react'
import { leagueOf, leagueStandings, PROMOTION_SPOTS } from '../../../engine/season/season.ts'
import type { Outcome } from '../../../engine/season/standings.ts'
import { useGame } from '../../../store/game.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { DivisionPicker } from './DivisionPicker.tsx'

const FORM_STYLE: Record<Outcome, string> = {
  V: 'bg-green-500',
  E: 'bg-gray-400',
  D: 'bg-red-500',
}

export function TableScreen() {
  const game = useGame()
  const { leagues } = game.world
  const [leagueId, setLeagueId] = useState(() => leagueOf(game.world, game.userClubId))
  const index = leagues.findIndex((league) => league.id === leagueId)
  const rows = leagueStandings(game, leagueId)
  const goesUp = (position: number) => index > 0 && position < PROMOTION_SPOTS
  const goesDown = (position: number) =>
    index < leagues.length - 1 && position >= rows.length - PROMOTION_SPOTS

  return (
    <section className="flex flex-col gap-3">
      <DivisionPicker leagues={leagues} value={leagueId} onChange={setLeagueId} />
      <div className="overflow-x-auto rounded bg-green-950/60">
        <table className="w-full text-sm tabular-nums">
          <thead className="text-green-300">
            <tr>
              <th className="px-2 py-2 text-right">#</th>
              <th className="px-2 text-left">Clube</th>
              <th className="px-2" title="Pontos">
                Pts
              </th>
              <th className="px-2" title="Jogos">
                J
              </th>
              <th className="px-2" title="Vitórias">
                V
              </th>
              <th className="px-2" title="Empates">
                E
              </th>
              <th className="px-2" title="Derrotas">
                D
              </th>
              <th className="hidden px-2 sm:table-cell" title="Gols pró">
                GP
              </th>
              <th className="hidden px-2 sm:table-cell" title="Gols contra">
                GC
              </th>
              <th className="px-2" title="Saldo de gols">
                SG
              </th>
              <th className="hidden px-2 md:table-cell">Últimos</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.clubId}
                className={`border-t border-green-900 ${row.clubId === game.userClubId ? 'bg-green-700/50' : ''}`}
              >
                <td
                  className={`border-l-4 px-2 py-1 text-right ${goesUp(i) ? 'border-blue-400' : goesDown(i) ? 'border-red-500' : i === 0 ? 'border-yellow-400' : 'border-transparent'}`}
                >
                  {i + 1}
                </td>
                <td className="max-w-40 px-2">
                  <ClubName
                    club={game.world.clubs[row.clubId]}
                    highlight={row.clubId === game.userClubId}
                  />
                </td>
                <td className="px-2 text-center font-bold">{row.points}</td>
                <td className="px-2 text-center">{row.played}</td>
                <td className="px-2 text-center">{row.wins}</td>
                <td className="px-2 text-center">{row.draws}</td>
                <td className="px-2 text-center">{row.losses}</td>
                <td className="hidden px-2 text-center sm:table-cell">{row.goalsFor}</td>
                <td className="hidden px-2 text-center sm:table-cell">{row.goalsAgainst}</td>
                <td className="px-2 text-center">{row.goalDifference}</td>
                <td className="hidden px-2 md:table-cell">
                  <span className="flex gap-1">
                    {row.form.map((outcome, j) => (
                      <span
                        key={j}
                        title={outcome}
                        className={`inline-block h-2.5 w-2.5 rounded-full ${FORM_STYLE[outcome]}`}
                      />
                    ))}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap gap-4 text-xs text-green-200">
        {index === 0 && (
          <span>
            <span className="text-yellow-400">■</span> Campeão
          </span>
        )}
        {index > 0 && (
          <span>
            <span className="text-blue-400">■</span> Acesso
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
