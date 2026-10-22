# onzemestre

Jogo de gerenciamento de futebol no browser, inspirado no Brasfoot. Nome provisório.

## Documentação

- [O jogo hoje](docs/00-o-jogo-hoje.md): o que a Carreira, o Draft com amigos e a plataforma têm agora
- [Ideias para o futuro](docs/01-ideias.md): o que ainda não foi feito, o que está em andamento e o que já foi descartado
- [Operação do servidor](docs/02-operacao.md): Supabase, login por código, Mercado Pago, avisos e domínio

Os planos antigos de cada etapa (00 a 15, de antes destes três) saíram da pasta e continuam no histórico do git.

## Rodando

Requer Node 22+.

```bash
npm install
npm run dev        # servidor local
npm test           # testes do motor (Vitest)
npm run lint       # Oxlint
npm run format     # Prettier
npm run build      # build de produção em dist/
npm run balance -- 50   # simula 50 temporadas e mostra se o mundo se mantém equilibrado
```

## Estrutura

```
docs/          documentação do projeto
src/engine/    motor do jogo em TypeScript puro (sem React), testável
  season/      calendário, tabela, artilharia, acesso e rebaixamento
src/store/     estado da carreira (Zustand)
src/db/        saves no IndexedDB (Dexie), um slot por carreira
src/worker/    Web Worker que simula rodadas sem travar a tela
src/cloud/     conta e save na nuvem (Supabase), opcionais
src/ui/        telas e componentes React
supabase/      tabelas, regras de acesso e funções do servidor
```

## Times de verdade: editor e pacotes de dados

O jogo vem só com times e jogadores fictícios. Quem quiser outros nomes monta um **pacote de dados** no Editor de times (menu principal) ou numa planilha, e escolhe "Usar pacote" no Novo jogo. O pacote fica só no navegador de quem o criou; o projeto não hospeda nem distribui pacotes. Escudos e imagens não são aceitos.

A planilha (`.csv`, separada por `;` ou `,`) tem uma linha por jogador:

```
ordem;clube;sigla;cidade;cor1;cor2;jogador;posicao;idade;overall
1;Clube Exemplo;CEX;Cidade;#c8102e;#000000;Fulano;G;30;80
;;;;;;Beltrano;Z;;
```

`ordem` é a posição do clube na força do mundo (1 a 20 na Série A, 21 a 40 na Série B); uma linha sem os campos do clube continua o clube de cima. Só `clube` e `jogador` são obrigatórios; o que faltar é gerado. O Editor também exporta e importa o mesmo pacote em JSON. Para montar um pacote com elencos reais, o Editor traz um prompt pronto para colar num assistente de IA com busca na internet: ele pede fontes e manda deixar de fora o que não for confirmado (`src/ui/aiPackPrompt.ts`). Veja o aviso legal em `/aviso-legal`.

## Contas e save na nuvem

A conta é opcional: sem ela o jogo roda inteiro offline, como antes. Com ela, as carreiras sincronizam entre aparelhos. O servidor é um projeto do [Supabase](https://supabase.com), e o jogo só mostra a conta quando estas variáveis existem no build (em `.env.local` ou nas variáveis de ambiente da Vercel):

```
VITE_SUPABASE_URL=https://<projeto>.supabase.co
VITE_SUPABASE_ANON_KEY=<chave anon ou publishable>
```

Para montar o servidor:

1. Crie um projeto no Supabase e rode `supabase/migrations/*.sql` no SQL Editor (ou `npx supabase link` e `npx supabase db push`).
2. Em Authentication > URL Configuration, use o endereço do jogo como Site URL e acrescente `https://<seu-dominio>/conta` (e as prévias da Vercel, se quiser) em Redirect URLs.
3. O login é por um código de 6 dígitos no e-mail: os modelos "Magic Link" e "Confirm signup" em Authentication > Emails precisam mostrar `{{ .Token }}`. O passo a passo está em [`docs/02-operacao.md`](docs/02-operacao.md#login-por-código).

Para testar no próprio computador, `npx supabase start` sobe tudo em Docker; os e-mails com o código aparecem no Mailpit em `http://127.0.0.1:54324`.

Cada carreira vai para a nuvem compactada (cerca de 150 KB). A conta grátis guarda uma carreira na nuvem; as outras ficam só no aparelho. Quem pagar vai guardar até 5: o número de cada conta fica na tabela `entitlements`, que só o servidor altera (o pagamento da fase 14 vai preenchê-la). Quando a mesma carreira foi jogada em dois aparelhos desde a última sincronização, o jogo pergunta qual fica e sugere a mais recente.

O motor nunca usa `Math.random`: toda aleatoriedade passa por `src/engine/rng.ts`, com semente, para que mundos e partidas sejam reproduzíveis.
