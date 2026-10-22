import { Component, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { versionText } from '../version.ts'

/**
 * Catches a page that broke while drawing, so the player sees what went
 * wrong and a way back instead of a blank screen. `resetKey` changes on
 * every navigation, which gives the next page a fresh try.
 */
export class CrashScreen extends Component<
  { resetKey: string; children: ReactNode },
  { error?: Error; key?: string }
> {
  state: { error?: Error; key?: string } = {}

  static getDerivedStateFromError(error: unknown) {
    return { error: error instanceof Error ? error : new Error(String(error)) }
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { error?: Error; key?: string },
  ) {
    if (state.key === props.resetKey) return null
    return { key: props.resetKey, error: undefined }
  }

  componentDidCatch(error: unknown) {
    console.error(error)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <main className="mx-auto flex min-h-svh max-w-xl flex-col items-center justify-center gap-4 p-4 text-center">
        <h1 className="text-xl">Algo deu errado</h1>
        <p className="text-muted-foreground">
          A página travou. Recarregar costuma resolver; se continuar, mande o texto abaixo.
        </p>
        <div className="flex gap-2">
          <Button size="lg" onClick={() => location.reload()}>
            Recarregar
          </Button>
          <Button size="lg" variant="outline" onClick={() => location.assign('/')}>
            Início
          </Button>
        </div>
        <pre className="max-h-64 w-full overflow-auto rounded-md bg-muted p-3 text-left text-xs whitespace-pre-wrap select-all">
          {`${error.message}\n${versionText()}\n${location.pathname}\n\n${error.stack ?? ''}`}
        </pre>
      </main>
    )
  }
}
