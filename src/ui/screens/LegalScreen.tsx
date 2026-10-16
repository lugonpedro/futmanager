import { Link } from 'react-router'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { ThemeToggle } from '../components/ThemeToggle.tsx'
import { CONTACT_URL } from '../contact.ts'

/** The legal notice and terms of use, linked from the main menu and the in-game menu. */
export function LegalScreen() {
  return (
    <main className="mx-auto flex max-w-3xl flex-col gap-4 p-4">
      <header className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-bold">Aviso legal</h1>
        <div className="flex items-center gap-1">
          <ThemeToggle />
          <Button asChild variant="ghost" size="sm">
            <Link to="/">Voltar</Link>
          </Button>
        </div>
      </header>

      <Card className="gap-3">
        <CardContent className="flex flex-col gap-3 text-sm leading-relaxed">
          <p>
            O futmanager é um jogo independente e não tem nenhuma ligação com clubes, federações,
            ligas ou atletas. O mundo gerado, que é o padrão, tem times e jogadores fictícios;
            qualquer semelhança é coincidência.
          </p>
          <p>
            O pacote de teste Brasileirão 2026, que vem com o jogo, usa os nomes populares dos
            clubes, como Flamengo ou Palmeiras, e os nomes dos atletas das Séries A e B de 2026, com
            cidade, cores, idade e posição, como informação factual. Ele não traz escudos,
            uniformes, fotos nem marcas oficiais, e os atributos e a força de cada jogador são
            inventados pelo jogo, sem relação com o desempenho real.
          </p>
          <p>
            Nomes inseridos pelos usuários no editor ou em pacotes importados são de
            responsabilidade de quem os inseriu e ficam no dispositivo do usuário. Quem usa o save
            na nuvem guarda uma cópia privada na própria conta, que só ele acessa. O futmanager não
            publica esses nomes.
          </p>
          <p>
            Se você representa um clube ou atleta e quer que um nome seja corrigido ou removido do
            pacote Brasileirão 2026, ou de qualquer parte do jogo,{' '}
            <a href={CONTACT_URL} className="underline underline-offset-2">
              fale com a gente
            </a>
            . O nome sai na versão seguinte do jogo.
          </p>
        </CardContent>
      </Card>

      <Card className="gap-3">
        <CardHeader>
          <CardTitle>Termos de uso</CardTitle>
        </CardHeader>
        <CardContent>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed">
            <li>
              O jogo vem com um mundo gerado: clubes, cidades e jogadores inventados. Nenhum nome,
              escudo ou marca real faz parte dele. O pacote de teste Brasileirão 2026 é opcional e
              só entra quando você o escolhe em Nova carreira.
            </li>
            <li>
              O editor de times e os pacotes de dados permitem trocar esses nomes. Tudo o que você
              digita ou importa fica guardado no seu navegador e, se você usar o save na nuvem, numa
              cópia privada na sua conta. O futmanager não publica, não compartilha e não distribui
              esses nomes nem os pacotes.
            </li>
            <li>
              Você é responsável pelos nomes que coloca no jogo e pelos pacotes que compartilha com
              outras pessoas. Use apenas conteúdo que você tem o direito de usar.
            </li>
            <li>
              Os pacotes não aceitam escudos nem imagens. O jogo sempre desenha um escudo genérico a
              partir das cores e da sigla do clube.
            </li>
            <li>
              O jogo é oferecido como está, sem garantia. Carreiras que não estão na nuvem ficam só
              no navegador e se perdem se os dados dele forem apagados.
            </li>
          </ol>
        </CardContent>
      </Card>
    </main>
  )
}
