# Draft online entre amigos

Pedido de 20/10/2026. Trocar a fantasia online de [05-online.md](05-online.md) por um modo em que um grupo de amigos cria uma sala, escolhe os elencos num draft (cada futebolista só pode ir para um time) e disputa uma liga entre esses times, com as partidas simuladas pelo nosso motor. Conferido no código da `main` no commit `6cadfa0` (PR #53).

Andamento: o passo P (passe por tempo) entrou no PR #58 o D0 no PR #60 e o D1 (regras da sala em `src/engine/room/` e `npm run room`) no PR #63 e o D2 (sala de espera, ainda sem link na tela inicial) no PR #64 e o D3 (draft ao vivo) no PR #65, todos de 20/10/2026. A liga mínima entrou no PR #66, pedida para testar com os amigos antes do D4. O D4 entrou no PR #67: cada um escala o próprio time e marca "Pronto", a rodada é jogada assim que todos marcam, o dono pode jogar sem esperar depois do prazo de segurança (e qualquer pessoa da sala depois do dobro do prazo, para um dono sumido não travar a liga), cada jogo pode ser assistido, e o fim da liga mostra campeão, artilheiro e melhor jogador, com o botão "Revanche". O D5 (mercado) entrou no PR #68: os pedidos de livres ficam no banco e são resolvidos pela `room-round` antes de cada rodada; trocas aceitas e dispensas passam pela função nova `room-market`, que aplica as regras de `src/engine/room/market.ts` ao estado da sala na hora. O estado ganhou uma versão, e cada escrita confere a versão que leu, para uma troca e uma rodada ao mesmo tempo não desfazerem uma à outra. O D6 (avisos) entrou no PR #69: gatilhos no banco percebem cada momento (o draft vai começar ou começou, é a vez de alguém, só falta uma pessoa dar "Pronto", rodada jogada, proposta de troca) e chamam a função nova `room-notify` pelo `pg_net`, uma vez só por aviso. As inscrições são as da fantasia: "rodadas" passou a valer para o draft e as rodadas da sala, e "mercado" para as propostas de troca. O D7 (passe) vem no PR seguinte: um gatilho em `rooms` recusa criar sala, ou abrir a revanche, sem passe valendo; entrar continua grátis. A função nova `pass` abre o pagamento no Mercado Pago, e a tela `/passe` mostra até quando o passe vale e espera o pagamento confirmar na volta. No D3, o mundo de onde a sala escolhe passou a ter semente fixa por pacote: um jogador é o mesmo em toda sala, e a fila de favoritos pode ser montada antes do draft. O resto ainda é plano.

## Resumo

- **Sala**: alguém cria, escolhe o pacote (Brasileirão 2026 por padrão; a Champions depois) e manda o convite. Cada amigo dá nome, cores e escudo ao seu time.
- **Draft ao vivo (síncrono)**: na hora marcada, todos entram e escolhem um jogador por vez, em serpentina, com tempo por escolha. Quem some tem a escolha feita pela fila de favoritos ou pelo automático. Ninguém escolhe um jogador já escolhido, e o banco garante isso.
- **Rodadas síncronas**: depois do draft, cada um escala o time e marca "Pronto". A rodada só é jogada quando todas as pessoas da sala estão prontas, e aí roda na hora. Para um amigo sumido não travar a sala, o dono pode jogar a rodada mesmo assim depois de um prazo de segurança (24 horas por padrão); quem não marcou joga com a última escalação, consertada para lesões e suspensões.
- **Mercado sem dinheiro**: os jogadores que ninguém escolheu ficam livres e podem ser pedidos entre as rodadas (o pior colocado tem a preferência); trocas entre amigos com aceite dos dois lados.
- **Lesões e cartões**: as mesmas regras da carreira (vermelho tira um jogo, três amarelos tiram um, lesão de uma a cinco rodadas), com a opção de lesões curtas ou desligadas na criação da sala.
- **Muito reaproveitamento**: o motor da partida, as escalações, a tabela, o replay das partidas, o código de convite das ligas, o passe e os avisos já existem. O trabalho novo é a regra do draft, o servidor da sala e a tela do draft.

## Por que muda

A fantasia atual é solitária: cada um monta um time de 100 moedas, e os amigos só se encontram na classificação. No draft os times são exclusivos, então a escolha de um mexe com todos, e as partidas são entre os times do grupo, não entre clubes da IA. É o formato que o Sleeper e as ligas de draft do futebol americano popularizaram, e ele combina melhor com o que o jogo tem de diferente: o motor simula o confronto direto entre os times dos amigos.

## Como funciona para o jogador

### 1. Criar a sala

Quem cria escolhe (com os padrões entre parênteses):

| Opção                  | Valores                                                                                                                                                                  |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Pacote                 | Os pacotes do jogo (Brasileirão 2026); a Champions entra quando o pacote existir                                                                                         |
| Times                  | 2 a 12 pessoas; robôs completam até o número de times escolhido (8), sempre um número par                                                                                |
| Elenco                 | 16, 18 ou 20 jogadores (18), com no mínimo 2 goleiros                                                                                                                    |
| Ordem do draft         | Serpentina (padrão) ou serpentina invertida na terceira volta, que tira quase toda a vantagem de escolher primeiro (decidido em 20/10/2026, depois das simulações do D1) |
| Tempo por escolha      | 30, 45, 60 ou 90 segundos (45)                                                                                                                                           |
| Reservas no automático | Liga ou desliga (desligado): as escolhas depois da 11ª saem da fila de cada um, para o draft acabar mais rápido                                                          |
| Data e hora do draft   | Marcada pelo dono; dá para começar antes se todos estiverem na sala                                                                                                      |
| Turnos                 | Só ida, ida e volta (padrão) ou dois returnos                                                                                                                            |
| Prazo de segurança     | Depois de quanto tempo esperando o "Pronto" o dono pode jogar a rodada mesmo assim: 6, 12, 24 (padrão) ou 48 horas                                                       |
| Lesões                 | Normais (padrão), curtas (no máximo 2 rodadas) ou desligadas                                                                                                             |
| Trocas                 | Ligadas até dois terços da liga (padrão), ligadas a temporada toda ou desligadas                                                                                         |

O convite é o mesmo das ligas da fantasia: link com código de 8 letras e números. Cada amigo, ao entrar, dá nome, sigla, cores e escudo ao time (os componentes de escudo e camisa da carreira servem: `ClubCrest`, `KitSwatch`, `ManagerCrest`).

### 2. Draft ao vivo

- **Ordem**: sorteada pelo servidor na hora de começar e mostrada a todos; em serpentina (1→8, depois 8→1), para quem escolhe por último numa volta escolher primeiro na seguinte.
- **Sala de espera**: mostra quem já entrou. Antes de começar, cada um monta a sua **fila de favoritos**, na ordem que quiser.
- **Na sua vez**: a lista de jogadores livres (com os filtros e a paginação do mercado da carreira), a carta e a ficha do jogador, e o relógio. Escolher tira o jogador da lista de todos na hora.
- **Tempo esgotado ou fora da sala**: o servidor escolhe o primeiro da sua fila que ainda esteja livre e caiba no elenco; sem fila, o melhor livre na posição que mais falta. Quem perde duas vezes seguidas passa para o automático até voltar e desligá-lo.
- **Robôs**: escolhem na hora, com a mesma regra do automático, para os times deles não serem só as sobras.
- **Regra de elenco**: o servidor recusa uma escolha que deixaria impossível completar o mínimo de goleiros com as escolhas que restam. Fora isso, cada um monta como quiser.
- **Quadro do draft**: uma grade com rodada × time mostrando quem foi para onde, para ver depois.
- **Tempo total**: com 8 times, elenco de 18 e 4 pessoas, são 72 escolhas de gente; com 20 segundos em média dá uns 25 minutos, e no pior caso (45 segundos cada) quase uma hora. Com 8 pessoas o pior caso passa de 1h45; por isso a opção "reservas no automático", que corta perto de 40% do tempo.

### 3. A liga

- **Calendário**: os times fazem turno e returno entre si, uma rodada por vez. Cada rodada é uma semana no calendário do jogo, então cansaço, lesões e suspensões andam como na carreira.
- **Escalar**: a mesma tela de escalação da carreira (campo, formação, postura, reservas, arrastar para trocar). Mostra quem está lesionado, suspenso ou pendurado (`PlayerStatus`).
- **Pronto**: cada um marca "Pronto" quando terminar de escalar, e pode desmarcar enquanto os outros não terminaram. A tela mostra quem já está pronto e quem falta. Quando o último marca, a rodada é jogada na hora e todos recebem o aviso.
- **Prazo de segurança**: se alguém não marca, o dono da sala pode tocar em "Jogar rodada" depois do prazo de segurança (24 horas por padrão), contado a partir da rodada anterior. Quem não marcou joga com a última escalação, consertada pelo `repairLineup`. O time de quem saiu da sala passa para a IA.
- **Jogar várias numa noite**: como a rodada roda assim que todos estão prontos, um grupo online junto pode jogar a liga inteira de uma vez.
- **Depois da rodada**: placares, tabela, artilharia e seleção da rodada, e cada jogo pode ser assistido de novo no campo 2D ou em texto, como na rodada da fantasia.
- **Fim da liga**: campeão, artilheiro, melhor jogador e o botão "Revanche", que abre uma sala nova com as mesmas pessoas e as mesmas opções.

### 4. Mercado

Sem dinheiro na primeira versão: o caixa, os salários e os patrocínios da carreira não entram. O mercado são três coisas:

1. **Pedir um jogador livre** (os que ninguém escolheu ou que foram dispensados): "quero o Fulano e dispenso o Beltrano". Os pedidos ficam guardados e são resolvidos no fechamento da rodada, na ordem de preferência: o pior colocado primeiro, e quem leva um jogador vai para o fim da fila. Até 2 pedidos atendidos por rodada para cada um. Na primeira rodada a preferência é a ordem inversa do draft.
2. **Trocar com um amigo**: de 1 a 3 jogadores de cada lado. Vale assim que o outro aceita, desde que os dois elencos continuem com o tamanho certo e com dois goleiros. Uma proposta vence no fechamento da rodada. Toda troca aparece no mural da sala.
3. **Dispensar**: o jogador volta para os livres, mas só pode ser pedido a partir do fechamento seguinte, para ninguém dispensar e pegar de volta na mesma janela.

O mercado fica aberto até a rodada ser jogada. Uma troca aceita desmarca o "Pronto" dos dois envolvidos, porque o elenco mudou; pedir ou dispensar um livre não desmarca, porque os pedidos só são resolvidos na hora de jogar. Lesionados e suspensos podem ser trocados e dispensados normalmente, com a situação à mostra.

Para depois: um modo com orçamento e **leilão** no lugar do draft em serpentina, que usaria os preços da fantasia (`prices.ts`).

### 5. Lesões, cartões e cansaço

O motor já faz tudo isso; a regra fica como na carreira, só que contada em rodadas da sala:

| O que            | Regra                                                                                                                   |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Vermelho         | Fica fora da rodada seguinte                                                                                            |
| Amarelos         | Três acumulados tiram uma rodada; o contador zera depois da suspensão                                                   |
| Lesão            | De 8 a 38 dias de jogo (curtas são bem mais comuns), ou seja, de uma a cinco rodadas; o elenco de 18 e os livres cobrem |
| Lesões curtas    | Opção da sala: no máximo 14 dias (duas rodadas)                                                                         |
| Sem lesões       | Opção da sala: o jogador sai machucado da partida, mas está bom na rodada seguinte                                      |
| Cansaço e fase   | Como na carreira; com uma semana entre as rodadas quase todo mundo chega descansado                                     |
| Evolução e idade | Desligadas: os atributos não mudam durante a sala, para a escolha do draft valer até o fim                              |

## Síncrono ou assíncrono

Decidido em 20/10/2026: **as duas partes síncronas**, o draft e as rodadas.

- **Draft síncrono**: a graça é ver o amigo levar o jogador que você queria. Acontece uma vez por sala, com hora marcada. O relógio, a fila e o automático resolvem quem não aparece, então uma pessoa nunca trava as outras.
- **Rodadas síncronas**: a rodada só é jogada quando todo mundo marcou "Pronto". Dá certo, e é até mais simples no servidor, porque não precisa de agendamento: o último "Pronto" chama a rodada. O risco é um amigo sumir e travar a sala; o prazo de segurança do dono e a passagem para a IA de quem sumiu cobrem isso.
- **Assistir junto** fica mais natural assim: quando a rodada roda, os amigos que estão online podem abrir os jogos ao mesmo tempo. Uma tela de "rodada ao vivo", com todos os jogos andando juntos, fica para depois e usa o mesmo replay.

## O que já existe e ajuda

| Parte                                    | Onde                                                                                                           | Como entra                                                                       |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| Pacotes                                  | `src/packs/`, `applyPack` em `src/engine/pack/pack.ts`                                                         | Montam o mundo de onde sai a lista de jogadores do draft                         |
| Partida, escalação automática e conserto | `match/simulate.ts`, `match/lineup.ts`                                                                         | `autoLineup`/`autoFormation` para robôs e quem saiu; `repairLineup` para o prazo |
| Tabela, calendário, artilharia           | `season/schedule.ts`, `season/standings.ts`                                                                    | Turno e returno entre os times da sala                                           |
| Cartões, suspensões, lesões              | `applyRound` em `season/season.ts`                                                                             | A parte de disciplina sai para uma função que a sala também usa                  |
| Fase e cansaço                           | `season/form.ts`, `fitness` da temporada                                                                       | Iguais                                                                           |
| Replay das partidas                      | `MatchReplay`, `replayMatch`, `slim` em `fantasy/official.ts`                                                  | A rodada da sala guarda os replays como a da fantasia                            |
| Servidor da temporada                    | `supabase/functions/fantasy-round`, `pg_cron`, `codec.ts`                                                      | O mesmo jeito: estado comprimido só no servidor, semente nova a cada rodada      |
| Convite                                  | `fantasy_invite_code`, `FantasyInviteScreen`                                                                   | Mesmo código e mesma tela, para salas                                            |
| Passe e avisos                           | Mercado Pago (PR #50), `webpush.ts`, `fantasy-notify`                                                          | Criar sala exige o passe; avisos novos                                           |
| Telas da carreira                        | `TeamScreen`, `PlayerSheet`, `PlayerCard`, `StandingsTable`, `FixtureLine`, `Pager`, filtros do `MarketScreen` | Ver abaixo                                                                       |

### Telas da carreira

As telas da carreira leem e gravam o `GameState` direto do `useGameStore`, então não dá para só apontar a sala para elas. O caminho é tirar delas as partes que só recebem dados:

- **Escalação**: a `TeamScreen` tem 940 linhas, com campo, banco, troca por arraste, formação e postura misturados com treino, venda e renovação. Sai um `LineupEditor` que recebe elenco, escalação, indisponíveis e `onChange`; a carreira e a sala usam o mesmo.
- **Lista de jogadores**: os filtros, a ordenação e a paginação do `MarketScreen` viram um componente que recebe a lista; o draft e o mercado da sala usam.
- **Ficha do jogador**: a `PlayerSheet` lê a temporada e o mercado da carreira; precisa de uma versão que receba só o jogador e a situação (lesão, suspensão, amarelos).
- **Tabela e jogos**: `StandingsTable` e `FixtureLine` já recebem quase tudo por props; pouca mudança.

Esses componentes saem num passo próprio (D0), que não muda nada para quem joga a carreira.

### Por que um estado próprio e não o `GameState`

Daria para montar a sala como uma carreira com vários técnicos, mas o `GameState` supõe um técnico só (`userClubId` aparece em 183 lugares), e a parte que a sala não quer é justamente a que mais mexe nele: caixa, patrocínio, mercado da IA, evolução, aposentadoria, Série B, copa. O plano é um `RoomState` novo em `src/engine/room/`, que reaproveita o motor da partida e as regras de disciplina, sem caixa e sem mercado da IA. Assim a carreira solo e o `SAVE_VERSION` não mudam.

## Servidor

### Tabelas

| Tabela         | O que guarda                                                                                                                                                                | Quem lê                                 |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| `rooms`        | Nome, dono, pacote, opções, situação (sala de espera, draft, liga, encerrada), código do convite, ordem do draft, escolha atual e o prazo dela, rodada atual e o prazo dela | Quem está na sala                       |
| `room_members` | Pessoa, vaga, nome, sigla, cores e escudo do time, automático ligado, "Pronto"                                                                                              | Quem está na sala                       |
| `room_pool`    | Os jogadores do pacote: nome, posição, geral, clube de origem e a ordem do automático                                                                                       | Quem está na sala                       |
| `room_picks`   | Número da escolha, vaga, jogador; **único por sala e jogador**                                                                                                              | Quem está na sala                       |
| `room_queues`  | A fila de favoritos de cada um                                                                                                                                              | Só o dono                               |
| `room_lineups` | A escalação de cada time para a próxima rodada                                                                                                                              | Só o dono                               |
| `room_moves`   | Pedidos de livres, propostas de troca e dispensas, com a situação de cada um                                                                                                | Os envolvidos; o mural mostra os feitos |
| `room_rounds`  | Por rodada: resultados, tabela, replays comprimidos                                                                                                                         | Quem está na sala                       |
| `room_states`  | O estado inteiro comprimido e a semente                                                                                                                                     | Só o servidor                           |

A restrição `unique (room_id, player_id)` em `room_picks` é o que impede dois times de terem o mesmo jogador, mesmo que duas escolhas cheguem no mesmo instante.

### Draft

- **Escolher** é uma função do Postgres, `draft_pick(sala, jogador)`, como as das ligas: trava a linha da sala, confere a vez, o prazo e a regra dos goleiros, grava a escolha e já passa a vez (fazendo na hora as escolhas dos robôs e de quem está no automático). Sem função do Deno no meio, para a escolha aparecer em menos de um segundo.
- **Tempo esgotado**: o relógio de cada navegador chama `draft_tick(sala)` quando zera; a função só faz a escolha automática se o prazo passou mesmo, então chamadas repetidas não estragam nada. Se todos fecharem a página, um `pg_cron` a cada 30 segundos faz o mesmo.
- **Ao vivo**: o Supabase Realtime avisa os navegadores a cada linha nova em `room_picks` e cada mudança em `rooms`, respeitando as regras de leitura. O projeto ainda não usa Realtime; é a única peça nova de infraestrutura.
- **Fim do draft**: a última escolha chama a função `room-start` (Deno), que monta o mundo da sala, sorteia a semente e o calendário e grava o estado e a rodada 0.

### Rodadas

- **Pronto** é uma função do Postgres, `room_ready(sala, pronto)`, que guarda a rodada para a qual cada um marcou (assim nada precisa ser desfeito quando a rodada é jogada). Quando ela vê que todas as pessoas estão prontas, chama a função `room-round` (Deno) pelo `pg_net`, com o número da rodada, do mesmo jeito que o `pg_cron` chama a `room-draft`. Passado o prazo de segurança, o dono chama a `room-round` direto, e ela confere com `can_play_round(sala)`.
- A `room-round` joga a rodada e a publica. A linha da rodada é gravada antes do estado, com a sala e a rodada como chave, então duas chamadas para a mesma rodada nunca jogam duas vezes. Um `pg_cron` a cada minuto repete a chamada das salas em que todos estão prontos e a última tentativa tem mais de 2 minutos (uma chamada que falhou).
- Cada rodada recebe uma semente nova, pelo mesmo motivo do O4: o replay publicado não pode entregar o futuro.
- Antes de jogar, a função resolve os pedidos de livres na ordem de preferência e cancela as propostas de troca que ninguém respondeu.
- **Escalar** passa pela função do Postgres `save_room_lineup(sala, escalação)`, que confere o formato e se todos são do elenco. Na hora de jogar, a `room-round` confere de novo com as regras do motor (`checkLineup`) e, se a escalação não servir, o time joga com a da última rodada. Depois de cada rodada, a `room-round` grava em `room_squads` o que cada time precisa para escalar a próxima: elenco, energia, forma e quem está fora.
- **Mercado**: pedir, reordenar e tirar pedidos de livres, propor, cancelar e recusar trocas são funções do Postgres (`room_claim`, `room_order_claims`, `room_unclaim`, `room_propose_trade`, `room_drop_trade`). Aceitar uma troca e dispensar mudam o estado da sala na hora, então passam pela função `room-market` (Deno), com as regras do motor. Quem joga onde fica espelhado em `room_rosters`, e o mural em `room_feed`.
- Medida de tamanho: a fantasia joga um dia do mundo inteiro (40 clubes, copa e Série B) em cerca de 0,1 s; uma rodada de sala com 8 times é bem menos. Cada rodada guarda uns 20 KB de replays com 4 jogos.

## Passo a passo

| Passo | O que entrega                                                                                                                                               | Onde no código                                                                          | Tamanho      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------ |
| P     | `fantasy_passes` vira `passes`, por tempo: uma linha por pagamento com início e fim, `grant_pass` e `has_pass()`; o webhook passa a dar 30 dias             | Migração `20261025000000_passes.sql`, `mercadopago-webhook`, `src/cloud/mercadopago.ts` | Pequeno      |
| D0    | `LineupEditor`, lista de jogadores e ficha que recebem dados por props; disciplina fora de `applyRound`. Nada muda para quem joga                           | `src/ui/components/`, `season/season.ts`                                                | Médio        |
| D1    | Regras da sala, puras e testadas: ordem em serpentina, regra do elenco, automático, montar a liga a partir das escolhas, jogar uma rodada, pedidos e trocas | `src/engine/room/`, `scripts/room.ts`                                                   | Médio/grande |
| D2    | Sala de espera: criar sala com as opções, convite, time de cada um, robôs                                                                                   | Migração, telas `/salas`, `/sala/:id`, `/sala/convite/:codigo`                          | Médio        |
| D3    | Draft ao vivo: fila, relógio, automático, quadro do draft                                                                                                   | `draft_pick`, `draft_tick`, Realtime, tela do draft                                     | Grande       |
| D4    | Liga da sala: escalar, "Pronto", rodada quando todos estão prontos, prazo de segurança, tabela, jogos para assistir, fim e revanche                         | Funções `room-start`, `room-round`, `room-lineup`, `pg_cron`, telas                     | Grande       |
| D5    | Mercado: livres, trocas, dispensas e mural                                                                                                                  | Funções do Postgres, tela do mercado da sala                                            | Médio        |
| D6    | Avisos: o draft vai começar, é a sua vez, falta só você dar "Pronto", rodada jogada, proposta de troca                                                      | Função `notify` nova, com o `webpush.ts` e as inscrições que já existem                 | Pequeno      |
| D7    | Passe de 30 dias para criar sala: função de compra e tela do passe (o banco e o webhook já vieram no passo P)                                               | Função `pass` (checkout), tela `/passe`, gatilho de passe em `rooms`                    | Pequeno      |
| D8    | Mais pacotes na criação da sala (Champions)                                                                                                                 | `src/packs/`, formato do pacote                                                         | À parte      |

D0 a D4 já formam um modo jogável (sem mercado, só com o elenco do draft). D5 vem logo em seguida, porque sem livres uma lesão longa pesa demais.

### D1: ajustar com simulações

Como na fantasia (`npm run fantasy`), um `npm run room -- 200` monta salas inteiras com todos no automático e joga as ligas, para ver:

- Se escolher primeiro decide a liga. Se o primeiro da ordem ganhar muito mais do que 1/8 das vezes, dá para trocar a serpentina pela "serpentina invertida na terceira volta", que algumas ligas usam.
- Se um time de seleção (os melhores da Série A juntos) faz placares absurdos no motor. O motor foi ajustado para clubes do Brasileirão; um time só de jogadores de geral 80 pode precisar de ajuste no `BALANCE`.
- Quantas rodadas cada time passa com um titular lesionado, para calibrar o elenco de 18 e as lesões curtas.

## Pacotes e a Champions

- O draft só precisa de uma lista de jogadores com nome, posição, geral e clube de origem. A sala monta o mundo com `applyPack(generateWorld(semente), pacote)` e pega todos os jogadores de todos os clubes, Série A e B juntas (uns 1.000 no Brasileirão 2026). Com 12 times de 20, são 240 escolhidos; sobra muita gente boa para o mercado.
- Os pacotes de hoje têm 40 vagas de clube (20 na Série A, 20 na Série B). Uma Champions com 36 clubes cabe nessas vagas sem mudar o formato, se o objetivo for só o draft. Para jogar a Champions na carreira, com fase de liga e mata-mata, o formato do pacote e o calendário precisam mudar; isso é outro plano.
- O servidor precisa ter os pacotes: hoje a `fantasy-round` importa o JSON do Brasileirão direto. Com vários pacotes, uma lista em `src/packs/index.ts` que o servidor também lê.
- Misturar pacotes numa sala (Brasileirão + Champions) é possível, mas o mesmo jogador pode estar nos dois; fica para depois, com a regra de juntar repetidos.
- Pacotes feitos no editor por quem cria a sala ficam fora: o servidor teria de conferir o arquivo, e nomes reais enviados por qualquer um aumentam o risco jurídico de [05-online.md](05-online.md).

## O que acontece com a fantasia

Decidido em 20/10/2026: **desligar agora**, sem esperar a sala. O PR do desligamento:

- Tira a tela `/fantasia` e as telas da rodada, da liga, do convite e do passe; os links antigos levam à tela inicial.
- Tira a aba "Fantasia online" do Aprenda, o card de avisos e a aba do passe na conta.
- Apaga as funções `fantasy-round`, `fantasy-team`, `fantasy-notify` e `fantasy-pass`, as regras em `src/engine/fantasy/` e o `npm run fantasy`. Tudo fica no histórico do git; o que a sala reaproveitar (pontuação, preços) volta de lá.
- Mantém o que a sala usa: `codec.ts`, `webpush.ts`, `push.ts`, `mercadopago.ts`, o replay, o service worker dos avisos e a função `mercadopago-webhook`.
- Traz uma migração que só para os três agendamentos. Apagar as tabelas fica num segundo passo, porque não tem volta (ver abaixo).

### O que sai do Supabase

| O quê                                                                                                                                                                                  | O que acontece                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Agendamentos `fantasy-round`, `fantasy-notify-mercado`, `fantasy-notify-rodada`                                                                                                        | Parados pela migração do PR                                                                                              |
| Tabelas `fantasy_seasons`, `fantasy_rounds`, `fantasy_season_states`, `fantasy_lineups`, `fantasy_leagues`, `fantasy_league_members`, `fantasy_notices`                                | Podem ser apagadas (é a maior parte do espaço: o mundo comprimido e uns 80 KB por rodada)                                |
| Funções do Postgres das ligas (`create_fantasy_league`, `join_fantasy_league`, `fantasy_league_invite`, `fantasy_league_standings`, `fantasy_invite_code`, `is_fantasy_league_member`) | Podem ser apagadas                                                                                                       |
| `fantasy_passes`                                                                                                                                                                       | **Fica**: é o registro de quem pagou. Perde só a ligação com a temporada; o passo P renomeia para `passes`, com validade |
| `push_subscriptions` e `save_push_subscription`                                                                                                                                        | **Ficam**, para os avisos da sala (D6). Sem o card, ninguém novo se inscreve até lá                                      |
| Funções publicadas `fantasy-round`, `fantasy-team`, `fantasy-notify`, `fantasy-pass`                                                                                                   | Apagar à mão: `supabase functions delete <nome>`, uma por vez                                                            |
| Segredos `FANTASY_CRON_SECRET` e, no Vault, `fantasy_cron_secret` e `project_url`                                                                                                      | Ficam, para a sala chamar a `room-round` do mesmo jeito                                                                  |
| Gatilho `passe_vitalicio`, se foi criado à mão                                                                                                                                         | Apagar: ele depende de `fantasy_seasons`, que sai                                                                        |

Apagar não tem volta, então fica numa migração à parte, só depois do seu ok. É esta:

```sql
alter table public.fantasy_passes drop constraint if exists fantasy_passes_season_id_fkey;
drop trigger if exists passe_vitalicio on public.fantasy_seasons;
drop function if exists public.passe_vitalicio();
drop function if exists public.create_fantasy_league(text);
drop function if exists public.join_fantasy_league(text);
drop function if exists public.fantasy_league_invite(text);
drop function if exists public.fantasy_league_standings(bigint);
drop function if exists public.fantasy_invite_code();
drop table if exists public.fantasy_league_members;
drop table if exists public.fantasy_leagues;
drop function if exists public.is_fantasy_league_member(bigint);
drop table if exists public.fantasy_notices;
drop table if exists public.fantasy_lineups;
drop table if exists public.fantasy_rounds;
drop table if exists public.fantasy_season_states;
drop table if exists public.fantasy_seasons;
```

Quem pagou o passe da temporada atual fica sem uso para ele até a sala chegar; o D7 dá a essas pessoas os 30 dias do passe novo a partir do lançamento. Como não havia pagantes quando o passo P entrou, isso ficou só como regra: uma cortesia sai com `select grant_pass('<id da conta>', 'cortesia', '<motivo>', 0, <dias>)`.

## Passe

Decidido em 20/10/2026: **passe por tempo, 30 dias**. Com ele a pessoa cria quantas salas quiser durante o mês; entrar em sala segue grátis, e num grupo basta um pagar. Uma sala criada dentro dos 30 dias vai até o fim, mesmo depois que o passe vence.

- `fantasy_passes` vira `passes` (passo P, adiantado em 20/10/2026, já que ainda não há pagantes): uma linha por pagamento, com `starts_at` e `ends_at` no lugar da temporada. A função `grant_pass` grava o pagamento a partir de agora ou do fim do passe que ainda vale, então comprar de novo soma 30 dias ao fim dele; o mesmo pagamento avisado duas vezes não soma nada. `has_pass()` diz se a pessoa tem passe valendo, e o gatilho `room_needs_pass` confere o mesmo antes de cada sala nova (D7).
- O passe vitalício vira uma linha que vence em `infinity`, sem gatilho.
- O webhook do Mercado Pago já chama `grant_pass` com 30 dias, e a preferência de pagamento leva só a conta (sem temporada) e volta para `/passe`. A função de compra (`pass`) e a tela vieram no D7.
- O preço continua o de hoje (R$ 5,00 em `PASS_PRICE_CENTS`) até haver motivo para mudar.

O princípio de [05-online.md](05-online.md) continua: pagar nunca dá vantagem dentro da sala.

## Cuidados

- **Semente só no servidor**, nova a cada rodada, como na fantasia.
- **Versão das regras** gravada na sala, para uma correção no meio não mudar resultados já jogados.
- **Draft que ninguém começa**: a sala de espera expira em 7 dias sem draft.
- **Pessoa que some no meio da liga**: o dono joga as rodadas pelo prazo de segurança; depois de 3 rodadas sem aparecer, o time passa para a IA (`autoLineup`), que escala o melhor time a cada rodada e conta sempre como pronto. Se o dono some, qualquer pessoa da sala pode forçar a rodada depois do dobro do prazo.
- **Trocas combinadas** para ajudar um amigo: todo mundo vê as trocas no mural; um veto do dono da sala fica como opção para depois, se aparecer abuso.
- **Limites**: até 10 salas ativas por pessoa e 12 pessoas por sala.
- **Política de privacidade**: incluir os nomes de time, as escolhas e as trocas (visíveis para a sala).

## Decisões

Fechadas em 20/10/2026:

1. **Fantasia**: desligada agora, sem esperar a sala.
2. **Passe**: por tempo, 30 dias.
3. **Robôs**: completam a liga até 8 times por padrão.
4. **Mercado**: sem dinheiro na primeira versão (livres, trocas, dispensas); o leilão fica para depois.
5. **Elenco e relógio**: 18 jogadores e 45 segundos por escolha como padrão.
6. **Rodadas**: síncronas, jogadas quando todos marcam "Pronto", com o prazo de segurança do dono.
