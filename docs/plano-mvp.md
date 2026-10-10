# Plano de implementação do MVP

Jogo de gerenciamento de futebol no browser, inspirado no Brasfoot. Base: [pesquisa.md](pesquisa.md).

## Objetivo do MVP

Jogar uma carreira completa de várias temporadas, offline, no navegador:
escolher um time, escalar, jogar rodadas com partida narrada em texto, contratar e vender jogadores, controlar o caixa, subir ou cair de divisão e ser demitido ou receber proposta de outro clube.

**Fora do MVP:** login, pagamento, save na nuvem, multiplayer, copas continentais, seleções, campo 2D animado, editor de times.

## Escopo de conteúdo

- 1 país fictício, 2 divisões de 20 times (Série A e B), turno e returno, 4 sobem e 4 descem
- 1 copa nacional mata-mata (opcional, fase 6)
- Times, jogadores e nomes 100% gerados por código (gerador de nomes brasileiros, sem marcas reais)

## Stack

- Vite + React + TypeScript
- Tailwind CSS + shadcn/ui (tabelas, diálogos, abas)
- Zustand para o estado da interface
- React Router para as telas
- Motor do jogo em TypeScript puro (`src/engine`), sem dependência de React
- Web Worker para simular a rodada sem travar a tela (Comlink para facilitar)
- Dexie (IndexedDB) para os saves
- Vitest para testes do motor; Oxlint + Prettier
- PRNG com semente (ex.: `seedrandom` ou um mulberry32 próprio) para partidas reproduzíveis
- Deploy: Vercel, Netlify ou GitHub Pages (site estático)

## Estrutura de pastas

```
src/
  engine/            # regras do jogo, puro TS, 100% testável
    model/           # tipos: Player, Club, League, Match, Season, Finance
    generate/        # gerador de mundo: nomes, jogadores, clubes, ligas
    match/           # simulação da partida e eventos narrados
    season/          # calendário, rodadas, tabela, acesso/rebaixamento
    transfer/        # mercado, propostas, IA de contratação
    finance/         # receitas, despesas, salários, bilheteria
    progression/     # evolução/declínio, aposentadoria, base
    career/          # emprego do técnico: demissão, propostas
    rng.ts
  worker/            # ponte do motor com o Web Worker
  store/             # Zustand
  db/                # Dexie: saves
  ui/
    screens/         # Início, Elenco, Escalação, Partida, Tabela, Mercado, Finanças, Calendário
    components/
```

## Modelo de dados (resumo)

- **Player**: id, nome, idade, posição (G, Z, L, M, A), força (1 a 100), potencial, características (ex.: cabeceio, drible, velocidade, marcação, finalização, passe), condição física, lesão, cartões, suspensão, salário, contrato até, valor de mercado, clube
- **Club**: id, nome, cores, reputação, estádio (capacidade), caixa, preço do ingresso, elenco, escalação/tática
- **League**: divisão, clubes, tabela, calendário de rodadas
- **Match**: mandante, visitante, placar, eventos (minuto, tipo, jogador, texto)
- **GameState**: temporada, rodada atual, clube do jogador, mundo inteiro; serializável em JSON para o save

## Fases

Cada fase termina com algo jogável e testes do motor passando.

### Fase 0: Esqueleto do projeto

- Vite + React + TS, Tailwind, React Router, Vitest, Oxlint + Prettier (shadcn/ui e Zustand entram junto com as primeiras telas que precisarem deles)
- CI no GitHub Actions rodando lint, testes e build
- Página inicial com "Novo jogo"

### Fase 1: Gerador de mundo (feita, em `src/engine/generate`)

- PRNG com semente (já entrou no esqueleto: `src/engine/rng.ts`)
- Gerador de nomes (listas de nomes e sobrenomes brasileiros) e de nomes de clubes
- Gera 40 clubes com elencos de ~25 jogadores, forças coerentes com a reputação
- Testes: mesma semente gera o mesmo mundo; todo elenco tem goleiros suficientes

### Fase 2: Simulação da partida (feita, em `src/engine/match`)

- Força do time = média ponderada por setor (defesa, meio, ataque) da escalação + fator casa + tática
- Simulação por minuto (90 passos): chance de lance de ataque, finalização e gol a partir da comparação entre setores; cartões, lesões e cansaço
- Saída: lista de eventos com texto narrado ("32' GOL! Fulano de cabeça")
- Testes de balanceamento: simular milhares de jogos e checar média de gols (~2,5 por jogo), taxa de vitória do mandante (~45%) e que o time mais forte vence mais
- Escalação automática por formação já entrou aqui (`autoLineup`), e a partida pode ser jogada minuto a minuto (`createMatch` + `playMinute`) com substituições e troca de postura, prontas para a fase 4
- Tela de amistoso em `/amistoso` para ver a narração rodando

### Fase 3: Temporada

- Calendário turno e returno, rodada simula todos os jogos (no Worker)
- Tabela com critérios de desempate, artilharia
- Fim de temporada: acesso/rebaixamento, premiação em dinheiro, nova temporada
- UI: Tabela, Calendário, tela de Partida "ao vivo" (eventos aparecendo minuto a minuto, placares dos outros jogos ao lado)

### Fase 4: Elenco e escalação

- Tela de elenco ordenável/filtrável
- Escalação com formações (4-4-2, 4-3-3, 3-5-2, 4-5-1, 5-3-2) e postura (defensiva, normal, ofensiva)
- Escalação automática para a IA e botão "escalar automaticamente" para o jogador
- Substituições e troca de tática durante a partida

### Fase 5: Finanças e mercado

- Receitas: bilheteria (público depende de reputação, fase e preço), premiação, patrocínio fixo por divisão
- Despesas: salários mensais
- Mercado: lista de jogadores, comprar/vender, propostas recebidas, negociação simples de salário e contrato
- IA dos clubes: vende quem sobra, compra para preencher carências, respeitando o caixa

### Fase 6: Carreira e progressão

- Evolução por idade e minutos jogados, declínio após ~30, aposentadoria
- Jogadores da base surgindo a cada temporada
- Diretoria: meta da temporada, demissão por mau desempenho, propostas de outros clubes
- Copa nacional mata-mata (se der tempo)

### Fase 7: Save e acabamento

- Salvar/carregar em IndexedDB, vários slots, autosave por rodada
- Exportar/importar save em arquivo
- PWA (instalável, offline)
- Ajuste fino de balanceamento rodando 50 temporadas automáticas

## Depois do MVP

1. Login + desbloqueio pago (pagamento único, com Pix)
2. Mais países e competições continentais
3. Editor de times
4. Save na nuvem e, quem sabe, ligas online entre amigos
5. Empacotar para Steam (Tauri) e mobile (Capacitor)

## Riscos

- **Balanceamento** é o que faz o jogo ser divertido; por isso o motor fica isolado e testado com simulações em massa desde a fase 2.
- **Performance**: simular a rodada inteira com eventos é leve, mas fica no Worker desde o começo para não travar a UI.
- **Nomes e marcas reais**: o MVP usa só dados gerados.
