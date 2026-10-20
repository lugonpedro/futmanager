import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { ThemeToggle } from '../components/ThemeToggle.tsx'

/** Any address the app doesn't know, such as a typo or an old link to a page that was removed. */
export function NotFoundScreen() {
  return (
    <main className="mx-auto flex min-h-svh max-w-xl flex-col gap-6 p-4">
      <header className="flex justify-end">
        <ThemeToggle />
      </header>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 pb-16 text-center">
        <p className="font-pixel text-6xl text-highlight [text-shadow:4px_4px_0_var(--pixel-shadow)] sm:text-7xl">
          404
        </p>
        <h1 className="text-xl">Bola fora!</h1>
        <p className="text-muted-foreground">
          Essa página não existe. O endereço pode estar errado ou a página mudou de lugar.
        </p>
        <Button asChild size="lg">
          <Link to="/">Voltar ao início</Link>
        </Button>
      </div>
    </main>
  )
}
