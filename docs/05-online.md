# Jogo online e pagamento

Continuação das fases 13 e 14 de [02-plano-pos-mvp.md](02-plano-pos-mvp.md). O primeiro modo online é um jogo de fantasia no estilo do Cartola, mas com as partidas simuladas pelo nosso motor. A liga de carreira entre amigos (a fase 13 original) vem depois, aproveitando o que este modo deixa pronto.

## Decisões

Fechadas em 16/10/2026:

1. **Primeiro formato online**: fantasia com o motor do jogo. A liga de carreira vem depois.
2. **Pontuação**: sai só do jogo simulado pelo motor, nunca do jogo real. No Cartola a pontuação vem dos scouts do jogo de verdade da rodada; aqui, quem vai bem é quem foi bem na simulação.
3. **Ritmo**: uma rodada por dia, num horário fixo. As 38 rodadas cabem em pouco mais de um mês.
4. **Pagamento**: passe por temporada. Jogar e entrar em liga são grátis; criar liga privada exige o passe.
5. **Classificação**: só ligas privadas entre amigos, sem classificação do site inteiro por enquanto.

## Como funciona para o jogador

- Um **Brasileirão oficial** roda no servidor, igual para todo mundo: o mesmo mundo do pacote do Brasileirão, a mesma tabela, todos os clubes com a IA.
- Cada um monta um **time de fantasia**: 11 jogadores numa das formações do jogo, um capitão, dentro de um orçamento de **100 moedas** que é igual para todos. Pagar nunca aumenta o orçamento.
- O mercado fecha antes da rodada. O servidor simula a rodada no horário e todos veem os jogos narrados e no campo 2D, a pontuação de cada jogador e a classificação da liga.
- Os preços sobem e descem com a pontuação recente.
- O mundo evolui de verdade: lesão, suspensão, cansaço e forma mudam quem vale a pena escalar.
- **Ligas privadas** com link de convite, para o grupo de amigos.

## O que já existe e ajuda

- **Motor determinístico em TypeScript puro**, com imports terminados em `.ts`. Ele roda numa função do Supabase (Deno), então o resultado é calculado no servidor e ninguém trapaceia pelo navegador.
- **Mundo rodando sozinho**: `scripts/balance.ts` já joga temporadas inteiras sem ninguém no comando.
- **Nota de 0 a 10 por jogador em cada partida**, gols, finalizações, defesas e cartões nos eventos.
- **Supabase com conta, perfil e saves na nuvem** (fase 12) e a tabela `entitlements`, escrita só pelo servidor, que é o gancho do pagamento.

## Passo a passo

| Passo | O que entrega                                                                                             | Onde no código                                                          | Tamanho       |
| ----- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------- |
| O1    | Pontuação, preços e regras do time: puras, testadas, ajustadas com simulações                             | `src/engine/fantasy/`, `scripts/fantasy.ts`                             | Médio         |
| O2    | Temporada oficial no servidor: cria o mundo com o pacote, roda a rodada no horário e guarda os resultados | `supabase/functions/`, migração nova, agendamento no Postgres           | Médio         |
| O3    | Time de fantasia: escalar, capitão, orçamento, mercado fecha no horário                                   | Migração (times e escalações por rodada), tela nova em `src/ui/screens` | Médio         |
| O4    | Rodada no app: jogos narrados e no campo 2D, pontuação do seu time e de cada jogador                      | Reaproveita a tela de partida; o cliente baixa os resultados da rodada  | Pequeno       |
| O5    | Ligas privadas com link de convite e a classificação de cada liga                                         | Migração e tela de ligas                                                | Pequeno/médio |
| O6    | Passe da temporada                                                                                        | Funções de checkout e webhook, `entitlements`                           | Médio         |
| O7    | Avisos: mercado fechando, rodada jogada (notificação do PWA e/ou e-mail)                                  | Service worker e função agendada                                        | Médio         |

O1 a O5 já formam um modo jogável; até O6 chegar, criar liga fica liberado para quem testa. Nenhum passo muda `SAVE_VERSION`, porque a carreira solo não muda.

Cuidados:

- A semente da temporada oficial fica só no servidor; com ela qualquer um poderia simular as rodadas antes.
- Cada versão do motor fica registrada na temporada, para uma correção no meio não mudar resultados já jogados.
- Só as partidas da Série A pontuam. A copa e a Série B continuam acontecendo no mundo e mexem no cansaço e nas lesões.

## O1: pontuação e preços

### Pontuação

Cada jogador que entrou em campo pontua pela partida (`src/engine/fantasy/scoring.ts`):

| Scout                               | Pontos                                                         |
| ----------------------------------- | -------------------------------------------------------------- |
| Nota do motor                       | 2,5 por ponto acima ou abaixo de 5,5, proporcional aos minutos |
| Gol                                 | Goleiro 10, zagueiro e lateral 9, meia 7, atacante 5           |
| Finalização defendida / para fora   | 0,5 / 0,2                                                      |
| Defesa do goleiro                   | 0,4 cada                                                       |
| Sem sofrer gol (60 minutos ou mais) | Goleiro 3, zagueiro 5, lateral 6, meia 2                       |
| Gol sofrido pelo goleiro            | −1 cada                                                        |
| Amarelo / vermelho                  | −1 / −5 (o segundo amarelo conta só como vermelho)             |
| Capitão                             | pontuação × 1,5                                                |

A nota do motor já leva em conta o resultado, os gols e os gols sofridos; os scouts por cima dela dão o peso de cada posição. Para isso o `MatchResult` passou a dizer quem jogou por qual lado e em que posição (`played`), sem mudar nenhum resultado.

### Preços

Em `src/engine/fantasy/prices.ts`:

- **Preço inicial** pelo geral da carta: 1 moeda até geral 50, subindo em curva até 25 moedas no geral 90.
- **Depois de cada jogo**, o preço anda 0,35 moeda por ponto de diferença entre a média dos últimos 3 jogos e o esperado para aquele preço (2,3 + 0,14 × preço). A mudança de uma rodada fica limitada a 15% do preço, e o mínimo é 1 moeda.
- Quem não jogou fica com o preço parado.

### Time

Em `src/engine/fantasy/team.ts`: 11 jogadores diferentes, cada um na posição de cadastro que a formação pede, capitão entre eles, custo dentro das 100 moedas. Quem não jogou na rodada marca zero.

### Ajuste com simulações

`npm run fantasy -- 3` joga três temporadas do pacote do Brasileirão sem ninguém no comando e mostra a pontuação por posição e por faixa de preço, os preços no começo e no fim e os maiores pontuadores. Com os números acima, por jogo de 60 minutos ou mais:

| Posição  | Média | Negativos | 10 ou mais |
| -------- | ----- | --------- | ---------- |
| Goleiro  | 4,4   | 19%       | 18%        |
| Zagueiro | 3,1   | 35%       | 7%         |
| Lateral  | 3,1   | 30%       | 9%         |
| Meia     | 3,2   | 17%       | 9%         |
| Atacante | 4,6   | 6%        | 19%        |

Jogadores mais caros pontuam mais (de 1,7 de média na faixa até 2 moedas a 5,0 acima de 16), então o orçamento obriga a escolher. Os atacantes ainda rendem um pouco mais por moeda; dá para revisar quando o modo estiver no ar e houver times de verdade para comparar.

## O2: temporada oficial no servidor

### Como funciona

- Todo dia às 21h de Brasília o Postgres (`pg_cron`) chama a função `fantasy-round` do Supabase.
- Sem temporada em andamento, a função abre uma: a primeira sai do pacote do Brasileirão com uma semente sorteada; as seguintes continuam o mesmo mundo, com os preços recalculados pelo geral. Abrir a temporada publica a rodada 0, que é o mercado de abertura.
- Com temporada em andamento, ela joga os dias de jogo até a próxima rodada da liga, inclusive os da copa e da Série B, pontua as partidas da Série A, move os preços e publica a rodada. Na rodada 38 a temporada fica encerrada, e a próxima abre no dia seguinte.
- Uma segunda chamada em menos de 20 horas não faz nada, e a mesma rodada não é gravada duas vezes. Assim uma nova tentativa nunca joga duas rodadas.
- Ninguém dirige clube nenhum. O jogo precisa de um "clube do técnico", e ele fica com o mais fraco da Série B, onde não ser cuidado no mercado pesa menos.
- A regra é toda pura em `src/engine/fantasy/official.ts`, testada com o pacote real; a função só lê e grava no banco. Medido no Deno, abrir a temporada leva cerca de 0,3 s e jogar uma rodada cerca de 0,1 s.

### Tabelas

| Tabela                  | O que guarda                                                                         | Quem lê       |
| ----------------------- | ------------------------------------------------------------------------------------ | ------------- |
| `fantasy_seasons`       | Ano, situação, versão das regras, rodadas jogadas e os clubes da Série A             | Todos         |
| `fantasy_rounds`        | Por rodada: as partidas da Série A, os pontos de cada jogador e o mercado da próxima | Todos         |
| `fantasy_season_states` | O mundo inteiro comprimido e a semente                                               | Só o servidor |

Cada rodada ocupa cerca de 80 KB (45 KB de partidas e 34 KB de mercado); o mundo comprimido, cerca de 145 KB.

### Para ligar no projeto do Supabase (uma vez)

1. Aplicar a migração: `supabase db push`.
2. Guardar no Vault o endereço do projeto e um segredo compartilhado, no SQL Editor:
   ```sql
   select vault.create_secret('https://<ref>.supabase.co', 'project_url');
   select vault.create_secret('<um segredo longo>', 'fantasy_cron_secret');
   ```
3. Dar o mesmo segredo à função: `supabase secrets set FANTASY_CRON_SECRET=<o mesmo segredo>`.
4. Publicar a função: `supabase functions deploy fantasy-round`.
5. Para abrir a primeira temporada sem esperar as 21h:
   ```sh
   curl -X POST https://<ref>.supabase.co/functions/v1/fantasy-round -H 'x-cron-secret: <o segredo>'
   ```

## O3: escalar o time

- **Tela "Fantasia online"** (`/fantasia`, com um botão na tela inicial): mostra a rodada, até quando o mercado fica aberto e quantos pontos o seu time fez na rodada anterior. Também mostra o seu time por posição, com capitão e o custo dentro das 100 moedas, e o mercado com filtro por posição e busca por jogador ou clube.
- **Mercado**: fecha às 20h30 de Brasília (23h30 UTC), meia hora antes da rodada, e reabre quando ela é publicada.
- **Salvar**: a função `fantasy-team` confere o time de novo com as mesmas regras do jogo (`checkTeam`) e com o mercado aberto, e grava em `fantasy_lineups`. O navegador nunca escreve na tabela; cada um lê só os próprios times.
- **Quem não mexe** joga com o último time que mandou, como no Cartola. Quando a rodada roda, `fantasy-round` pontua o time de todo mundo (`scoreLineups`) e grava os pontos.
- **Ligar no projeto**: aplicar a migração nova (`supabase db push`) e publicar a função (`supabase functions deploy fantasy-team`).

## O4: rodada no app

- **Tela da rodada** (`/fantasia/rodada/N`, com o botão "Ver os jogos da rodada" na tela da fantasia): os dez jogos da Série A com placar, quantos jogadores do seu time estavam em cada um, os pontos do seu time jogador por jogador (capitão contando 1,5 vez) e os dez que mais pontuaram. Setas levam às rodadas anteriores.
- **Assistir um jogo**: o jogo roda de novo no navegador, minuto a minuto, no campo 2D ou só em texto, com estatísticas e notas, igual à partida da carreira. No apito final aparecem os pontos de cada jogador, com os do seu time em destaque.
- **Como o jogo se repete igual**: cada rodada guarda, em `fantasy_rounds.replays` (JSON compactado, uns 55 KB por rodada), a escalação dos dois times, os jogadores envolvidos e a semente da partida. O navegador recria a partida com `replayMatch` e chega ao mesmo resultado do servidor; um teste confere isso jogo a jogo.
- **A semente não vaza o futuro**: a semente de uma partida entrega a semente do mundo naquele momento. Por isso o servidor dá ao mundo uma semente nova antes de cada rodada e de cada temporada (`playOfficialRound` e `nextOfficialSeason` recebem a semente). O que a repetição revela já foi jogado. Como isso muda os resultados, `FANTASY_VERSION` passou para 2.
- **Ligar no projeto**: aplicar a migração nova (`supabase db push`) e publicar de novo a função (`supabase functions deploy fantasy-round`).

## Pagamento

Princípio: **pagar nunca dá vantagem em pontos**.

- **Passe da temporada**: entrar numa liga e jogar é grátis; criar liga privada exige o passe da temporada atual. Num grupo de amigos basta um pagar, o que ajuda a espalhar o jogo. Como cada temporada dura pouco mais de um mês, o preço precisa caber nesse ritmo (algo perto de R$ 10, a testar).
- Os 5 saves na nuvem da carreira solo seguem como compra única à parte.
- Checkout com **Mercado Pago** (Pix e cartão) ou **Stripe** (aceita Pix e facilita vender fora depois). Conferir as taxas atuais antes de escolher.
- Uma função no Supabase cria o pagamento; o webhook do provedor confirma e grava em `entitlements` (que ganha uma coluna como `pass_season`, a temporada até a qual o passe vale). O navegador nunca escreve ali.
- Página de compra, recibo por e-mail e um jeito de pedir reembolso.
- Nas lojas de celular (fase 14, Capacitor) a compra dentro do app passa pela loja, que fica com uma parte. Fica para quando chegar lá.

Jurídico (não é parecer): com nomes reais e versão paga, o risco da fase 11 aumenta, e a decisão de falar com um advogado continua valendo. Fantasia **sem prêmio em dinheiro** fica longe das regras de apostas; prêmio em dinheiro muda isso e fica fora do plano.

## Depois: liga de carreira entre amigos

Cada amigo é técnico de um clube no mesmo mundo. O `GameState` hoje supõe um técnico só (`userClubId` aparece 183 vezes em 32 arquivos), e caixa, mercado, patrocínio, treino e empréstimos guardam só o lado do jogador, então é a parte grande.

| Passo | O que entrega                                                                                                           | Tamanho |
| ----- | ----------------------------------------------------------------------------------------------------------------------- | ------- |
| A1    | `GameState` com vários técnicos: caixa, mercado, patrocínio, treino e empréstimos por clube humano; sobe `SAVE_VERSION` | Grande  |
| A2    | Liga no servidor: cria o mundo, recebe escalações, roda a rodada no prazo (reaproveita O2)                              | Médio   |
| A3    | Mercado entre humanos: propostas, troca, aceite dos dois lados                                                          | Médio   |
| A4    | Telas: "Estou pronto", mural da liga, quem já jogou                                                                     | Médio   |

## Formatos considerados e deixados de lado

- **Desafio da semana** (todos jogam a mesma carreira e comparam no fim): barato, mas o resultado sai do navegador e é fácil trapacear.
- **Copa dos amigos com o elenco da carreira solo**: quem está na décima temporada atropela quem começou ontem.
