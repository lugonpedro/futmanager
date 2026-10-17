import { CheckIcon } from 'lucide-react'
import { Link } from 'react-router'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { cn } from '@/lib/utils'
import { cloudEnabled } from '../../cloud/client.ts'
import { FREE_CLOUD_SLOTS, PAID_CLOUD_SLOTS } from '../../cloud/sync.ts'
import { useAccountStore } from '../../store/account.ts'
import { ThemeToggle } from '../components/ThemeToggle.tsx'

type Plan = {
  key: 'none' | 'free' | 'paid'
  title: string
  tag?: string
  summary: string
  points: string[]
}

const PLANS: Plan[] = [
  {
    key: 'none',
    title: 'Sem conta',
    summary: 'Jogue à vontade, só neste aparelho.',
    points: [
      'Quantas carreiras quiser, salvas neste navegador.',
      'Trocar de aparelho ou limpar os dados do navegador apaga o progresso.',
    ],
  },
  {
    key: 'free',
    title: 'Conta grátis',
    summary: 'Uma carreira que vai com você para qualquer aparelho.',
    points: [
      'Entre com o mesmo e-mail no celular e no computador e continue de onde parou.',
      'O jogo salva na nuvem sozinho enquanto você joga.',
      'Outras carreiras continuam só neste aparelho.',
    ],
  },
  {
    key: 'paid',
    title: 'Assinatura',
    tag: 'Em breve',
    summary: `Até ${PAID_CLOUD_SLOTS} carreiras na nuvem.`,
    points: [
      'Vários clubes ao mesmo tempo, todos em qualquer aparelho.',
      'Ajuda a pagar o servidor do jogo.',
    ],
  },
]

/** Explains what an account adds: one career on every device for free, more for paying players. */
export function CloudScreen() {
  const { user, cloudSlots } = useAccountStore()
  const current = !user ? 'none' : cloudSlots > FREE_CLOUD_SLOTS ? 'paid' : 'free'

  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Jogar em vários aparelhos</h1>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Voltar</Link>
          </Button>
        </div>
      </header>

      <p className="text-sm leading-relaxed text-muted-foreground">
        Com uma conta, sua carreira fica guardada na nuvem: comece no computador, continue no
        celular e volte sem perder nada. A conta grátis leva uma carreira; quem assinar vai poder
        levar até {PAID_CLOUD_SLOTS}.
      </p>

      <div className="grid gap-3 sm:grid-cols-3">
        {PLANS.map((plan) => (
          <Card
            key={plan.key}
            className={cn('gap-3', plan.key === current && 'border-primary ring-2 ring-primary')}
          >
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {plan.title}
                {plan.tag && <Badge variant="secondary">{plan.tag}</Badge>}
                {plan.key === current && <Badge>Seu plano</Badge>}
              </CardTitle>
              <CardDescription>{plan.summary}</CardDescription>
            </CardHeader>
            <CardContent>
              <ul className="flex flex-col gap-2 text-sm">
                {plan.points.map((point) => (
                  <li key={point} className="flex gap-2">
                    <CheckIcon className="mt-0.5 size-4 shrink-0 text-primary" />
                    {point}
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Como funciona</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed">
            <li>Entre com um código que chega no seu e-mail. Não tem senha.</li>
            <li>
              A carreira jogada por último vai para a nuvem. No menu, ela aparece com o ícone de
              nuvem; as outras aparecem como &quot;só neste aparelho&quot;.
            </li>
            <li>
              Para trocar qual carreira fica na nuvem, toque no botão de nuvem ao lado dela. A
              anterior sai da nuvem e dos outros aparelhos, mas continua neste.
            </li>
            <li>
              Em outro aparelho, entre com a mesma conta e a carreira aparece no menu. Se você jogou
              nos dois sem internet, o jogo pergunta qual versão fica.
            </li>
          </ol>
        </CardContent>
      </Card>

      {cloudEnabled ? (
        <Button asChild size="lg" className="self-center">
          <Link to="/conta">{user ? 'Ver minha conta' : 'Criar conta ou entrar'}</Link>
        </Button>
      ) : (
        <p className="text-center text-sm text-muted-foreground">
          Contas ainda não estão disponíveis nesta versão do jogo.
        </p>
      )}
    </main>
  )
}
