# Página Aprenda

Plano para uma página **Aprenda** que explica como funcionam a Carreira e a Fantasia online. Ela entra no menu principal logo abaixo de "Fantasia online". Todos os números deste documento foram tirados do código em `src/engine` (commit `c7b2155`), não de memória; a coluna "De onde vem" diz o arquivo para conferir.

## Decisões

Fechadas em 16/10/2026:

1. **Rota**: `/aprenda/:tab?`, com duas abas, `carreira` e `fantasia`, no mesmo molde de `/jogo/clube/:tab?`. Cada seção tem uma âncora (`/aprenda/carreira#mercado`) para outras telas apontarem direto para ela.
2. **Sempre visível**: o botão "Fantasia online" só aparece quando a nuvem está configurada (`cloudEnabled`). O "Aprenda" aparece sempre; a aba Fantasia continua lá e avisa no topo que o modo precisa de conta.
3. **Também dentro do jogo**: um link "Aprenda" no menu lateral da carreira (`GameLayout.tsx`), junto de "Aviso legal", abrindo a aba Carreira.
4. **Texto escrito à mão, números vindos do motor**: o texto fica em `src/ui/learn.ts`, uma lista de seções por aba, mas cada número (pontos por vitória, vagas de acesso, orçamento de 100 moedas, pontuação da fantasia) é importado das constantes do motor (`PROMOTION_SPOTS`, `BOARD`, `SCORING`, `PRICES`, `BUDGET`, `TRAINING`, `MARKET`...). Se alguém ajustar o balanceamento, a página muda junto e nunca fica mentindo.
5. **Sem biblioteca nova**: nada de Markdown nem accordion. Cartões do shadcn/ui (`Card`) e `Tabs`, que já existem, mais um índice no topo de cada aba.
6. **Sem mudança no save**: a página só lê constantes. `SAVE_VERSION` fica onde está.
7. **Sem preço do passe**: a página diz que criar liga exige o passe, mas não mostra o valor, que vem do Stripe e pode mudar.

## Passo a passo

| Passo | O que entrega                                                                                                                     | Onde no código                                                                                   | Tamanho |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ------- |
| A1    | Tela `/aprenda` com abas, índice e âncoras; botão no menu principal abaixo de "Fantasia online"                                   | `src/ui/screens/LearnScreen.tsx`, `src/App.tsx`, `src/ui/screens/HomeScreen.tsx`                 | Pequeno |
| A2    | Aba Carreira, com as 13 seções descritas abaixo                                                                                   | `src/ui/learn.ts`                                                                                | Médio   |
| A3    | Aba Fantasia, com as 7 seções descritas abaixo                                                                                    | `src/ui/learn.ts`                                                                                | Pequeno |
| A4    | Link no menu do jogo e atalhos "Como funciona?" nas telas que mais confundem (mercado, treino, patrocínio, escalação da fantasia) | `GameLayout.tsx`, `MarketScreen.tsx`, `TrainingPanel.tsx`, `ClubScreen.tsx`, `FantasyScreen.tsx` | Pequeno |

A1 a A3 cabem num PR só. A4 pode vir junto ou depois.

Testes:

- `src/ui/learn.test.ts` confere alguns textos contra as constantes (por exemplo, que o texto de acesso diz `PROMOTION_SPOTS` clubes e que a tabela de pontuação bate com `SCORING`) e que nenhum número saiu como `undefined` ou `NaN`.
- As âncoras dos atalhos do A4 são tipadas pela lista de seções, então um link para uma seção que não existe não compila.

Cuidados:

- O texto fala com o jogador, sem jargão de código: "geral" em vez de overall, "rodada" em vez de match day.
- Números com fórmula viram frases simples ("o preço sobe se o jogador pontua acima do esperado para o preço dele") e só os valores que o jogador consegue usar aparecem.
- A página precisa funcionar no celular: índice em lista rolável e tabelas com no máximo três colunas.

---

## A2: Aba Carreira

Treze seções, nesta ordem. Abaixo, o que cada uma explica e os números do motor que ela mostra.

### 1. Começando

- Você escolhe um clube num mundo gerado, com times e jogadores fictícios, ou no pacote Brasileirão 2026. Também dá para importar ou editar um pacote no editor.
- O mundo tem a Série A e a Série B, com 20 clubes cada. Os elencos começam com 25 jogadores.
- Mesma semente, mesmo mundo; e cada partida tem a sua própria semente, então assistir ao vivo ou simular dá o mesmo resultado.

De onde vem: `generate/world.ts`, `season/season.ts` (`matchSeed`).

### 2. Calendário da temporada

- A temporada vai de janeiro a dezembro. Janeiro é a pré-temporada.
- O campeonato tem 38 rodadas (turno e returno), aos sábados de abril a dezembro. O primeiro sábado de junho e o de setembro ficam livres (datas FIFA). Rodadas no meio da semana entram onde precisar para caber tudo.
- A Copa Nacional é jogada na quarta-feira depois das rodadas 5, 11, 17, 23, 29 e 35.
- Salários e patrocínio caem no dia 1º de cada mês.
- Avançar até o próximo jogo para no dia em que chega uma proposta por um jogador seu, para você responder antes de ela vencer. "Simular jogo" joga a partida sem assistir; "Simular até o fim da temporada" vai direto ao fim, sem parar.

De onde vem: `season/calendar.ts` (`seasonDates`, `transferWindows`), `season/cup.ts` (`CUP_ROUNDS`), `season/season.ts` (`advanceToNextGame`), `worker/season.worker.ts`.

### 3. Tabela, acesso e premiação

- Vitória vale 3 pontos, empate 1.
- Desempate na ordem do Brasileirão: pontos, vitórias, saldo, gols marcados, confronto direto, menos vermelhos, menos amarelos.
- **4 sobem e 4 caem** entre a Série A e a Série B.
- Premiação no fim da temporada: o campeão da Série A leva R$ 30 milhões e o da Série B R$ 8 milhões. O valor cai aos poucos até um quarto disso para o último colocado.
- Artilharia e craque da temporada (melhor nota média entre quem jogou pelo menos metade das rodadas).

De onde vem: `season/standings.ts` (`POINTS`, `standings`), `season/rules.ts` (`PROMOTION_SPOTS`), `season/season.ts` (`CHAMPION_PRIZE`, `prizeMoney`), `season/form.ts` (`bestPlayer`).

### 4. Copa Nacional

- Os 40 clubes entram, em mata-mata de jogo único.
- Os 16 de menor reputação jogam uma primeira fase; os 24 maiores esperam por eles.
- Empate vai para os pênaltis: cinco cobranças para cada lado, depois morte súbita.
- Cada vitória paga um prêmio; a final vale R$ 12 milhões e cada fase anterior paga um pouco menos da metade da seguinte.
- Lesões da copa valem para o campeonato; cartões ficam só na copa.

De onde vem: `season/cup.ts` (`createCup`, `shootout`, `CUP_FINAL_PRIZE`), `season/season.ts` (`playCup`).

### 5. Diretoria e emprego

- **Objetivo**: a diretoria espera que você termine duas posições abaixo de onde a reputação do clube o coloca, nunca pior do que escapar do rebaixamento. Na tela aparece como "Ser campeão", "Conquistar o acesso", "Escapar do rebaixamento" ou "Terminar entre os N primeiros".
- **Confiança** começa em 60, de 0 a 100. Cada vitória no campeonato dá +2, cada derrota −2.
- A partida da rodada 6, a tabela também pesa: mais de duas posições abaixo do objetivo custa até 4 por rodada; estar dentro do objetivo dá +1.
- Se a confiança chega a zero, você é demitido na hora e recebe propostas de 3 clubes um pouco menores.
- No fim da temporada: objetivo cumprido dá +20; errar custa 10 mais 5 por posição abaixo. A temporada seguinte começa com a confiança entre 40 e 80.
- Fechar a temporada com 70 ou mais pode trazer até 2 propostas de clubes maiores.

De onde vem: `career/board.ts` (`BOARD`, `seasonTarget`, `objectiveText`, `confidenceAfterMatch`, `confidenceAtClose`, `findJobOffers`).

### 6. Escalação e tática

- Dez formações: 4-4-2, 4-3-3, 3-5-2, 4-5-1, 5-3-2, 3-4-3, 4-2-4, 5-4-1, 4-1-4-1 e 4-2-3-1. O 4-1-4-1 defende um pouco mais e ataca um pouco menos (3%); o 4-2-3-1 faz o contrário.
- Posições: goleiro, zagueiro, lateral, meio-campo e atacante. Fora da posição o jogador rende menos: 97% numa posição secundária dele, 92% em qualquer outra. Jogador de linha no gol é desastre. A cor do nome mostra isso: verde, amarelo, vermelho.
- **Postura**: defensiva (+8% na defesa, −10% no ataque, cansa menos), normal, ou ofensiva (+10% no ataque, −8% na defesa, cansa 15% mais).
- Até 5 substituições, com 7 no banco. Durante o jogo dá para trocar formação, postura e posições sem gastar substituição.
- O mandante joga com vantagem. Atacantes rápidos contra zagueiros lentos rendem mais, principalmente para quem joga no contra-ataque. Cerca de um quinto das chances vem pelo alto (cruzamentos, escanteios, faltas), e aí o cabeceio conta.
- Em média saem uns 2,5 gols por jogo e o mandante vence cerca de 45% das vezes.

De onde vem: `match/lineup.ts` (`FORMATIONS`, `BENCH_SIZE`), `match/strength.ts` (`FAMILIARITY`, `POSTURE_EFFECT`, `FORMATION_EFFECT`), `match/simulate.ts` (`BALANCE`, `MAX_SUBSTITUTIONS`).

### 7. Energia, forma e notas

- **Energia** vai de 0 a 100. Cai durante o jogo, mais rápido para quem tem pouca resistência. Um jogador sem energia rende até 20% menos. Depois da partida volta 4 pontos por dia, e até o dobro para quem tem muita resistência.
- **Nota** de 3 a 10 em cada jogo: começa em 6; vitória +0,6, empate +0,1, derrota −0,4; gols, defesas e cartões mexem nela; goleiro e defensores ganham por não sofrer gol e perdem por gol sofrido.
- **Forma** de −2 a +2, das últimas 5 notas. Cada passo vale 1,5% de rendimento, para mais ou para menos.
- **Seleção da rodada**: os melhores de cada posição num 4-3-3 ganham carta especial.

De onde vem: `season/form.ts` (`RECOVERY_PER_DAY`, `formOf`, `FORM_GAMES`, `roundStars`), `match/strength.ts` (`matchShape`, `FORM_EFFECT`), `match/simulate.ts` (`ratings`).

### 8. Cartões e lesões

- Vermelho suspende pelo próximo jogo do campeonato. Três amarelos também.
- Lesões tiram o jogador de 8 a 38 dias; as curtas são bem mais comuns.
- O treino físico aumenta o risco de lesão (1,2×); o descanso diminui (0,8×).

De onde vem: `season/season.ts` (`YELLOWS_FOR_SUSPENSION`, `INJURY_DAYS`), `progression/training.ts` (`TRAINING.injury`).

### 9. Jogadores e cartas

- A carta mostra seis números. Linha: Ritmo, Finalização, Passe, Drible, Defesa e Físico. Goleiro: Elasticidade, Manejo, Reposição, Reflexo, Velocidade e Posicionamento. Cada um é a média de alguns dos 26 atributos, que aparecem na gaveta de detalhes.
- O **geral** depende da posição: um zagueiro é quase só Defesa e Físico; um atacante, Finalização, Ritmo e Drible.
- Cor da carta: bronze abaixo de 50, prata de 50 a 69, ouro a partir de 70. Seleção da rodada e craque da temporada têm cartas próprias.
- **Estilos** (Paredão, Muralha, Finalizador, Velocista...) dão um pequeno bônus no lance em que contam. A versão "+" vale o dobro e aparece quando os atributos do estilo têm média 84 ou mais.

De onde vem: `player/attributes.ts` (`FACE_PARTS`, `OVERALL_WEIGHTS`, `STYLE_ATTRIBUTES`, `STYLE_PLUS_FROM`), `ui/format.ts` (`CARD_CUTS`), `match/strength.ts` (`STYLE_POINTS`).

### 10. Evolução, potencial e aposentadoria

- Os jogadores evoluem todo dia 1º, de maio a dezembro, e uma última vez no fechamento da temporada.
- Até 21 anos crescem rápido rumo ao potencial, e mais rápido quanto mais jogam: 25 jogos contam como uma temporada cheia, e para os mais novos cada jogo vale 1,5. De 22 a 25 ainda crescem. De 26 a 29 ficam estáveis se jogarem mais de metade da temporada, e caem um pouco se não. De 30 a 32 perdem de 1 a 3 pontos por ano, e depois disso de 2 a 5.
- O **potencial** aparece como uma faixa: até 7 pontos para cada lado num jovem que quase não jogou. Ela estreita a cada jogo e fica exata aos 28 anos.
- Jogador emprestado conta como tendo jogado pelo menos 75% da temporada.
- A partir dos 35 o jogador pode se aposentar; aos 38 sempre se aposenta.
- Todo ano a base sobe 1 ou 2 jovens, na posição em que o elenco está mais curto.

De onde vem: `progression/progression.ts` (`PROGRESSION`, `yearChange`, `potentialRange`, `retirementChance`, `youthIntake`).

### 11. Treino

- **Foco do elenco**: equilibrado, físico, técnico ou tático (o grupo escolhido cresce 35% mais rápido), ou descanso (cresce 15% menos, recupera 30% mais rápido e se machuca menos).
- **Plano individual**, para jogadores de até 30 anos que ainda crescem: um foco (finalização, passe, drible, cruzamento, defesa, cabeceio, velocidade, goleiro ou geral) e uma intensidade. Leve, normal e intenso dão +2, +3,5 e +5 pontos por temporada nos atributos do plano. Intenso recupera 20% mais devagar; leve, 15% mais rápido.

De onde vem: `progression/training.ts` (`TRAINING`, `FOCUS_ATTRIBUTES`).

### 12. Mercado, contratos e empréstimos

- **Janelas**: o mês de janeiro inteiro e o de julho. Jogador sem clube pode ser contratado a qualquer momento.
- O elenco precisa ter de 18 a 32 jogadores, com pelo menos 2 goleiros.
- O clube pede o valor de mercado vezes 1,6 por um titular e vezes 1,25 por um reserva.
- O jogador pede 15% a mais de salário para mudar de clube, e mais 1% por ponto de reputação que o clube novo tem a menos. Para renovar, 5% a mais. Contratos de 1 a 5 temporadas.
- **Vender**: coloque o jogador à venda. Com a janela aberta, ele recebe proposta em metade das rodadas; sem estar à venda, só às vezes (8%). Cada proposta vale 7 dias.
- Jogadores com contrato no fim saem quando a temporada fecha; renove antes.
- **Empréstimo**: só até 23 anos, no máximo 4 ao mesmo tempo, com a janela aberta. Vai para um clube de uma divisão abaixo que precisa da posição dele, que paga o salário até o fim da temporada.

De onde vem: `season/calendar.ts` (`transferWindows`), `transfer/market.ts` (`MARKET`, `askingPrice`, `wageDemand`, `closeContracts`), `transfer/loans.ts` (`LOAN`, `loanClub`).

### 13. Finanças e patrocínio

- **Entradas**: bilheteria nos jogos em casa, patrocínio todo dia 1º, premiações e vendas. **Saídas**: salários todo dia 1º e contratações.
- **Bilheteria**: o público depende da reputação, da posição na tabela e do preço do ingresso. O jogo mostra um preço justo para o tamanho do clube; acima dele o público cai rápido, abaixo ele cresce até lotar.
- **Patrocínio master**: no começo da temporada chegam três ofertas, que ficam abertas até a primeira rodada. A segura paga 100% por mês e um bônus de 2 meses pela meta; a equilibrada paga 85% com bônus de 5 meses; a ousada paga 70% com bônus de 10 meses, com a meta do título. Se você não escolher, a diretoria assina a segura. Título aumenta as ofertas seguintes em 15%, acesso em 10%, e rebaixamento as reduz em 10%. O contrato dura de 1 a 3 temporadas e acaba antes se o clube cair ou se você trocar de clube.
- **Patrocínios menores** (manga, costas e calção): todo dia 1º, de janeiro a novembro, cada espaço vazio tem chance de receber uma oferta, que espera 20 dias pela resposta.
- Caixa negativo não demite, mas aperta: dá para vender jogadores ou mexer no ingresso.
- **Fim da temporada**: premiação, bônus do patrocínio, todo mundo um ano mais velho, aposentadorias, base, contratos vencidos, acesso e rebaixamento e nova tabela. Se foi demitido, você escolhe uma das propostas.

De onde vem: `finance/economy.ts` (`ECONOMY`, `attendance`, `fairTicketPrice`), `finance/finance.ts` (`payday`, `matchdayPayments`), `finance/sponsors.ts` (`SPONSOR`), `season/season.ts` (`startNextSeason`).

---

## A3: Aba Fantasia

No topo: "A Fantasia online precisa de conta. Jogar e entrar nas ligas dos amigos é grátis." Se a nuvem não está configurada, a aba explica o modo mesmo assim, sem o botão de jogar.

### 1. O que é

- Um **Brasileirão oficial** roda no servidor, igual para todos: o mundo do pacote Brasileirão, todos os clubes com a IA.
- Os pontos vêm só do jogo simulado pelo motor, nunca do jogo de verdade. Quem vai bem é quem foi bem na simulação.

### 2. Ritmo da rodada

- Uma rodada por dia. O mercado fecha às 20h30 (horário de Brasília) e a rodada é jogada às 21h.
- Quem ativou os avisos recebe um lembrete às 19h30 e outro quando a rodada termina.
- O mercado abre de novo assim que a rodada sai.
- Depois da rodada dá para ver os jogos narrados e no campo 2D, com os pontos de cada jogador.

De onde vem: `fantasy/team.ts` (`MARKET_CLOSE_UTC`, `marketClosesAt`), `supabase/migrations/20261016000000_temporada_oficial.sql` e `20261021000000_avisos.sql` (horários do agendamento).

### 3. Montando o time

- 11 jogadores numa das dez formações do jogo, cada um na sua posição, e um capitão.
- **Orçamento de 100 moedas**, igual para todos. O passe não aumenta o orçamento.
- Só jogadores da Série A.
- Quem não mandar time novo joga com o último que mandou.

De onde vem: `fantasy/team.ts` (`BUDGET`, `checkTeam`, `scoreLineups`).

### 4. Pontuação

Uma tabela gerada a partir de `SCORING`:

| O que                        | Pontos                                                         |
| ---------------------------- | -------------------------------------------------------------- |
| Nota do motor                | 2,5 por ponto acima ou abaixo de 5,5, proporcional aos minutos |
| Gol                          | Goleiro 10, zagueiro e lateral 9, meia 7, atacante 5           |
| Finalização defendida        | 0,5                                                            |
| Finalização para fora        | 0,2                                                            |
| Defesa (goleiro)             | 0,4                                                            |
| Sem sofrer gol (60+ minutos) | Lateral 6, zagueiro 5, goleiro 3, meia 2                       |
| Gol sofrido (goleiro)        | −1                                                             |
| Amarelo                      | −1                                                             |
| Vermelho                     | −5                                                             |
| Capitão                      | Pontos × 1,5                                                   |

Quem não entrou em campo marca zero.

De onde vem: `fantasy/scoring.ts` (`SCORING`, `matchPoints`), `fantasy/team.ts` (`teamPoints`).

### 5. Preços

- O preço inicial sai do geral: 1 moeda até geral 50, subindo até 25 moedas para geral 90 ou mais.
- Cada preço tem uma pontuação esperada: cerca de 2,3 pontos mais 0,14 por moeda. Um jogador de 10 moedas deveria fazer uns 3,7 pontos.
- Depois de cada rodada que ele jogou, o preço sobe se a média dos últimos 3 jogos ficou acima do esperado e cai se ficou abaixo. Muda no máximo 15% por rodada, então um jogo só nunca decide o preço.
- Quem não jogou fica com o mesmo preço.
- Na virada de temporada os preços recomeçam pelo geral.

De onde vem: `fantasy/prices.ts` (`PRICES`, `startingPrice`, `expectedPoints`, `nextPrice`), `fantasy/official.ts`.

### 6. Um mundo que muda

- Lesão, suspensão, cansaço e forma valem como na carreira. Escalar quem jogou na quarta pela copa pode sair caro no sábado.
- A Copa e a Série B continuam acontecendo, mas só os jogos da Série A pontuam.
- Os jogadores evoluem, envelhecem e trocam de clube como na carreira.

De onde vem: `fantasy/official.ts`, seções 7, 8 e 10 da aba Carreira.

### 7. Ligas e passe

- Ligas privadas com link de convite, até 100 participantes, com a classificação de cada uma.
- Entrar numa liga é grátis. Criar exige o **passe da temporada**, que libera até 10 ligas na temporada.

De onde vem: `supabase/migrations/20261019000000_ligas.sql` (limite de 100), `ui/screens/FantasyPassScreen.tsx`.
