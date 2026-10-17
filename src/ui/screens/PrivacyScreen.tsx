import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import { CONTACT_URL } from '../contact.ts'

/** What the optional account keeps about the player and how to have it deleted (LGPD). */
export function PrivacyScreen() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Privacidade</h1>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Voltar</Link>
          </Button>
        </div>
      </header>

      <Section title="Sem conta">
        <p>
          O jogo funciona inteiro sem conta. Nesse caso nada sai do seu aparelho: as carreiras, os
          nomes do editor e as preferências ficam guardados só no navegador.
        </p>
      </Section>

      <Section title="O que a conta guarda">
        <ul className="flex list-disc flex-col gap-1 pl-5">
          <li>
            Seu e-mail, para você entrar. Se entrar com o Google, também o nome e a foto que o
            Google envia.
          </li>
          <li>O apelido e o escudo que você escolher no perfil.</li>
          <li>
            As carreiras que você salvar na nuvem, incluindo os nomes que você colocou no editor de
            times.
          </li>
          <li>
            Na fantasia online: seus times de cada rodada e as ligas em que você está. Quem está
            numa liga com você vê o seu apelido, o seu escudo e os seus pontos.
          </li>
          <li>
            Se comprar o passe da temporada: a data, o valor e o código do pagamento. Os dados do
            cartão ou do Pix ficam só com o Stripe, que processa o pagamento.
          </li>
          <li>
            Se ligar os avisos: o endereço que o navegador cria para receber notificações e quais
            avisos você quer. As notificações passam pelo serviço de push do navegador (Google,
            Apple ou Mozilla), que só recebe o texto já criptografado.
          </li>
          <li>
            Registros técnicos de acesso (como endereço IP e horário de entrada), mantidos pelo
            provedor por segurança.
          </li>
        </ul>
      </Section>

      <Section title="Para que usamos">
        <p>
          Só para fazer a conta funcionar: entrar, guardar e sincronizar suas carreiras, montar a
          fantasia online e as ligas com amigos, liberar o passe que você comprou e mandar os avisos
          que você ligou. Não vendemos dados, não mostramos anúncios e não usamos rastreadores. Suas
          carreiras na nuvem são privadas: só você, entrando na sua conta, consegue vê-las.
        </p>
      </Section>

      <Section title="Onde ficam">
        <p>
          A conta e as carreiras ficam no Supabase, o serviço de login e banco de dados que o
          onzemestre usa. Os pagamentos passam pelo Stripe. Os servidores dos dois podem ficar fora
          do Brasil.
        </p>
      </Section>

      <Section title="Por quanto tempo">
        <p>
          Enquanto a conta existir. Ao apagar a conta, o perfil e as carreiras na nuvem são apagados
          na hora; cópias de segurança do provedor podem levar alguns dias para expirar.
        </p>
      </Section>

      <Section title="Seus direitos">
        <p>
          Pela LGPD você pode ver, corrigir, levar e apagar seus dados. No jogo, o apelido e o
          escudo se corrigem em{' '}
          <Link to="/conta" className="underline underline-offset-2">
            Conta
          </Link>
          e o botão &quot;Apagar conta e dados&quot; apaga tudo o que está na nuvem. Para receber
          uma cópia dos seus dados ou qualquer outro pedido,{' '}
          <a href={CONTACT_URL} className="underline underline-offset-2">
            fale com a gente
          </a>
          .
        </p>
      </Section>
    </main>
  )
}

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle>{props.title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
        {props.children}
      </CardContent>
    </Card>
  )
}
