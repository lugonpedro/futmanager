# futmanager

Jogo de gerenciamento de futebol no browser, inspirado no Brasfoot. Nome provisório.

## Documentação

- [Plano do MVP](docs/01-plano-mvp.md): escopo, stack, estrutura e fases
- [Pesquisa](docs/00-pesquisa.md): features do Brasfoot, escolha de stack e monetização

## Rodando

Requer Node 22+.

```bash
npm install
npm run dev        # servidor local: Novo jogo começa uma carreira, /amistoso joga uma partida avulsa
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
src/ui/        telas e componentes React
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

O motor nunca usa `Math.random`: toda aleatoriedade passa por `src/engine/rng.ts`, com semente, para que mundos e partidas sejam reproduzíveis.
