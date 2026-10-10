import { Navigate, NavLink, Outlet } from 'react-router'
import { isSeasonOver } from '../../../engine/season/season.ts'
import { useGameStore } from '../../../store/game.ts'
import { ClubName } from '../../components/ClubName.tsx'
import { divisionName, formatMoney } from '../../format.ts'

const TABS = [
  { to: '/jogo', label: 'Resumo', end: true },
  { to: '/jogo/tabela', label: 'Tabela' },
  { to: '/jogo/calendario', label: 'Calendário' },
  { to: '/jogo/artilharia', label: 'Artilharia' },
]

/** Header and tabs around every screen of a running career. */
export function GameLayout() {
  const game = useGameStore((s) => s.game)
  if (!game) return <Navigate to="/novo" replace />
  const club = game.world.clubs[game.userClubId]
  const { season } = game

  return (
    <main className="min-h-screen bg-green-900 p-4 text-white">
      <div className="mx-auto flex max-w-4xl flex-col gap-4">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-col">
            <h1 className="text-xl font-bold">
              <ClubName club={club} />
            </h1>
            <p className="text-sm text-green-200">
              {divisionName(club.division)} {season.year} ·{' '}
              {isSeasonOver(season)
                ? 'temporada encerrada'
                : `rodada ${season.round} de ${season.totalRounds}`}{' '}
              · caixa {formatMoney(club.cash)}
            </p>
          </div>
          <NavLink to="/" className="text-sm text-green-200 underline">
            Menu
          </NavLink>
        </header>
        <nav className="flex gap-1 overflow-x-auto border-b border-green-700">
          {TABS.map((tab) => (
            <NavLink
              key={tab.to}
              to={tab.to}
              end={tab.end}
              className={({ isActive }) =>
                `rounded-t px-3 py-2 text-sm whitespace-nowrap ${isActive ? 'bg-green-700 font-semibold' : 'text-green-200 hover:bg-green-800'}`
              }
            >
              {tab.label}
            </NavLink>
          ))}
        </nav>
        <Outlet />
      </div>
    </main>
  )
}
