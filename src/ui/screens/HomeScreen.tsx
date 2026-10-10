import { Link } from 'react-router'
import { useGameStore } from '../../store/game.ts'

export function HomeScreen() {
  const game = useGameStore((s) => s.game)
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 bg-green-900 p-4 text-white">
      <h1 className="text-4xl font-bold">futmanager</h1>
      <p className="text-green-100">Gerencie seu time rumo à primeira divisão.</p>
      {game && (
        <Link to="/jogo" className="rounded bg-yellow-400 px-6 py-3 font-semibold text-green-950">
          Continuar com {game.world.clubs[game.userClubId].name} ({game.season.year})
        </Link>
      )}
      <Link
        to="/novo"
        className={
          game
            ? 'rounded border border-green-400 px-6 py-3 text-green-100'
            : 'rounded bg-yellow-400 px-6 py-3 font-semibold text-green-950'
        }
      >
        Novo jogo
      </Link>
      <Link to="/amistoso" className="text-green-100 underline">
        Jogar um amistoso
      </Link>
    </main>
  )
}
