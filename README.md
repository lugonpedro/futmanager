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

O motor nunca usa `Math.random`: toda aleatoriedade passa por `src/engine/rng.ts`, com semente, para que mundos e partidas sejam reproduzíveis.
