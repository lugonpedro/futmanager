# onzemestre

Jogo de gerenciamento de futebol no navegador, inspirado no Brasfoot. Vite + React + TypeScript, Tailwind v4 e shadcn/ui.

## Convenções

- Pull requests em português do Brasil: título e descrição. Mensagens de commit também.
- O código (nomes, comentários, testes) fica em inglês; textos que o jogador vê ficam em português.
- Documentos em `docs/` seguem uma linha do tempo: cada arquivo novo leva o próximo número na frente. Hoje são o `18-o-jogo-hoje.md` (o que existe) e o `19-ideias.md` (o que não existe); quando algo de `19` for feito, mova para o `18`. Não renumere os que já existem.

## Estrutura

- `src/engine`: regras do jogo em TypeScript puro, sem React. Tudo determinístico a partir de uma semente (`rng.ts`, `mixSeed`); nunca use `Math.random` aqui.
- `src/worker`: simulação de rodadas num Web Worker.
- `src/db`: saves no IndexedDB (Dexie), um slot por carreira.
- `src/store`: estado da interface (Zustand).
- `src/ui` e `src/components/ui`: telas e componentes shadcn/ui.

Quando o formato do `GameState` mudar, suba `SAVE_VERSION` e acrescente o passo em `src/engine/save.ts`, para os saves antigos continuarem abrindo.

## Antes de abrir um PR

```sh
npm run lint
npm run format:check
npm test
npm run build
```
