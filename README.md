# futmanager

Jogo de gerenciamento de futebol no browser, inspirado no Brasfoot. Nome provisório.

## Documentação

- [Plano do MVP](docs/plano-mvp.md): escopo, stack, estrutura e fases
- [Pesquisa](docs/pesquisa.md): features do Brasfoot, escolha de stack e monetização

## Rodando

Requer Node 22+.

```bash
npm install
npm run dev        # servidor local (/amistoso joga uma partida de teste)
npm test           # testes do motor (Vitest)
npm run lint       # Oxlint
npm run format     # Prettier
npm run build      # build de produção em dist/
```

## Estrutura

```
docs/          documentação do projeto
src/engine/    motor do jogo em TypeScript puro (sem React), testável
src/ui/        telas e componentes React
```

O motor nunca usa `Math.random`: toda aleatoriedade passa por `src/engine/rng.ts`, com semente, para que mundos e partidas sejam reproduzíveis.
