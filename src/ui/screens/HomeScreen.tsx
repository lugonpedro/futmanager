import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { useGameStore } from '../../store/game.ts'
import { ThemeToggle } from '../components/ThemeToggle.tsx'

export function HomeScreen() {
  const game = useGameStore((s) => s.game)
  return (
    <main className="relative flex min-h-screen items-center justify-center p-4">
      <div className="absolute top-3 right-3">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-sm">
        <CardContent className="flex flex-col items-stretch gap-4 text-center">
          <h1 className="text-4xl font-bold">futmanager</h1>
          <p className="text-muted-foreground">Gerencie seu time rumo à primeira divisão.</p>
          {game && (
            <Button asChild size="lg" className="h-auto py-3 whitespace-normal">
              <Link to="/jogo">
                Continuar com {game.world.clubs[game.userClubId].name} ({game.season.year})
              </Link>
            </Button>
          )}
          <Button asChild size="lg" variant={game ? 'outline' : 'default'}>
            <Link to="/novo">Novo jogo</Link>
          </Button>
          <Button asChild variant="link">
            <Link to="/amistoso">Jogar um amistoso</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}
