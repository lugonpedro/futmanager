# Funções em campo e playstyles

Pedido de 21/10/2026. Inspirado no EA FC 26: escolher a função de cada jogador em campo (corta pra dentro, falso 9, atacante sombra...) tanto na carreira quanto no draft online, e ter playstyles nas cartas tirados dos atributos. Conferido no código da `main` no commit `677d5f5` (PR #73).

Andamento: os playstyles (parte 1) entraram no PR #75 e as funções (parte 2) no PR #78, ambos de 21/10/2026. Depois do primeiro teste, ainda no mesmo dia, veio uma rodada de ajustes; ela está em "Ajustes depois do primeiro teste", e o que ficou diferente do plano está em "Como ficou". O passo a passo para tudo funcionar no ar está em "Para ligar no ar", no fim do documento.

## Decisões do Lugon

- A função pode ser qualquer uma do setor, não só as que a formação sugere.
- Ninguém perde um playstyle. Com a idade, o "+" pode voltar a ser o normal.
- Os playstyles vêm primeiro, e aparecem na cartinha.

## O que já existia

- **Papéis por vaga** (`src/engine/match/roles.ts`): cada vaga de cada formação tem um papel fixo (ponta, volante, meia ofensivo, segundo atacante...). O papel muda o peso do jogador em defesa, meio e ataque, quanto ele chuta e o nível dele na vaga. O jogador não escolhe: vem da formação.
- **12 playstyles com "+"** (`src/engine/player/attributes.ts`): sorteados quando o jogador é gerado, que sobe os atributos ligados a eles. O "+" aparece quando a média desses atributos chega a 84. Cada um dá 1,5 ponto (3 no "+") no lance em que conta. A carta já mostrava os estilos.
- **O motor não simula posição em campo** (`src/engine/match/simulate.ts`): ele soma a força dos setores, decide se sai chute, quem chuta, se é bola aérea e o contra-ataque pela velocidade. Toda função e todo playstyle precisa mexer numa dessas coisas para valer algo.
- Carreira e draft usam a mesma escalação (`LineupSlot`) e o mesmo motor, então o que entra no motor vale nos dois.

## Parte 1: playstyles (feito)

### A regra

Um jogador tem um playstyle quando os atributos ligados a ele estão pelo menos 4 pontos acima do que é normal para a posição e o geral dele, com média de pelo menos 50. Vale no máximo 3 por jogador, os que mais se destacam primeiro. O "+" continua sendo a média 84 ou mais.

"Normal para a posição e o geral" é o mesmo perfil que gera os jogadores: um zagueiro de 70 costuma ter uns 73 de defesa, então ser Muralha pede marcação e força bem acima disso.

- **Na geração:** os talentos sorteados continuam subindo os atributos como antes (sorteio igual, então a mesma semente gera os mesmos jogadores no draft e nas carreiras novas). Os playstyles que a carta mostra são os que os atributos dão.
- **Na evolução:** todo dia 1º, depois de evoluir, o jogador ganha os playstyles que passou a merecer, se ainda tiver vaga. Nunca perde nenhum. Se os atributos caírem (idade), o "+" volta a ser o normal sozinho.
- **Saves antigos:** a versão do save passou para 14. Na abertura, todo jogador mantém os playstyles que tinha e ganha os que os atributos dão, até 3.

Num mundo gerado, a média ficou em 0,3 playstyle por jogador abaixo de 50, 1,4 entre 50 e 69 e 1,6 de 70 para cima, perto do que o sorteio dava antes (0,5, 1,5 e 2).

### Os 17 playstyles

| Playstyle                 | Vem de                               | Posições | O que faz no jogo                                                  |
| ------------------------- | ------------------------------------ | -------- | ------------------------------------------------------------------ |
| Paredão                   | Reflexo, elasticidade                | G        | Pega mais chutes                                                   |
| Bem colocado              | Posicionamento, manejo               | G        | Pega mais chutes                                                   |
| Goleiro-líbero            | Reposição, aceleração                | G        | **Novo efeito:** corta o contra-ataque do adversário               |
| Muralha                   | Marcação, força                      | Z, L     | Reforça a defesa                                                   |
| Desarmador                | Desarme, interceptação               | Z, M     | Reforça a defesa                                                   |
| Cabeceador                | Cabeceio, impulsão                   | Z, A     | Ganha mais bolas aéreas                                            |
| Cruzador                  | Cruzamento, passe longo              | L        | Mais bolas aéreas para o time                                      |
| Velocista                 | Aceleração, velocidade               | Z, L, A  | Ganha na corrida e puxa contra-ataque                              |
| Passe preciso             | Passe curto, controle                | L, M     | Reforça o meio                                                     |
| Armador                   | Visão, passe longo                   | M        | Mais jogadas de ataque                                             |
| Driblador                 | Drible, agilidade                    | M, A     | Mais jogadas de ataque                                             |
| Finalizador               | Finalização, posicionamento ofensivo | M, A     | Chuta mais e marca mais                                            |
| **Chute de longe**        | Força do chute, controle             | M, A     | Chuta mais, finaliza melhor, e mais gols dele saem de fora da área |
| **Bola parada**           | Pênalti, cruzamento                  | L, M     | Escanteios e faltas levam mais bolas aéreas (metade do Cruzador)   |
| **Incansável**            | Resistência                          | L, M     | Cansa 12% menos (24% no "+")                                       |
| **Trator**                | Força, agressividade                 | Z, M, A  | Reforça defesa e meio                                              |
| **Passe em profundidade** | Visão, passe curto                   | Z, M     | O melhor do time aumenta o contra-ataque                           |

Em negrito, os cinco novos, inspirados no Power Shot, Dead Ball, Relentless, Bruiser e Incisive Pass do FC.

### Na tela

- **Cartinha:** os playstyles aparecem embaixo da carta, com o "+" em destaque (fundo escuro e letra amarela). Passando o mouse, aparece o que ele faz e de quais atributos vem. Vale para a carreira, o mercado e as cartas do draft.
- **Ficha do jogador:** seção nova "Estilos de jogo", com o que cada um faz, de onde vem, e o playstyle que ele está perto de ganhar ("Perto de ganhar Driblador: falta pouco em drible e agilidade"), para o treino ter um alvo.
- **Aprenda:** um item novo explica que os playstyles saem dos atributos, que nunca se perdem e que o "+" pode cair com a idade.

## Parte 2: funções em campo

### Como funciona para o jogador

- Na escalação, tocar no jogador abre a escolha de função. Dá para escolher qualquer função do setor da vaga (defesa, meio ou ataque, e o goleiro).
- Sem escolha, a vaga usa a função em que o jogador rende mais, como a "Melhor função" que a ficha já mostra.
- A carta e a ficha mostram o nível do jogador na função escolhida ("Falso 9: 78").
- Os times da IA e o automático do draft escolhem a melhor função de cada um.

### Funções da primeira leva

| Setor   | Funções                                                                         |
| ------- | ------------------------------------------------------------------------------- |
| Goleiro | Goleiro, Goleiro-líbero                                                         |
| Defesa  | Zagueiro, Xerife, Zagueiro construtor, Lateral, Ala ofensivo, Lateral invertido |
| Meio    | Volante, Regista, Box-to-box, Armador, Meia, Atacante sombra                    |
| Ataque  | Ponta aberta, Corta pra dentro, Centroavante, Pivô, Falso 9, Segundo atacante   |

Os papéis de hoje (ZAG, LAT, VOL, MC, MEI, PE, PD, CA, SA...) viram as funções padrão de cada uma dessas linhas, então nada muda para quem não escolher.

### O que cada função mexe no motor

Cada função é uma linha de tabela, como os papéis de hoje: pesos dos atributos (o nível na função), peso em defesa, meio e ataque, frequência de chute, e no máximo um efeito próprio:

- **Corta pra dentro:** chuta mais e cruza menos. Rende mais com o pé bom do lado oposto (canhoto na direita), e menos no lado do pé bom.
- **Ponta aberta:** cruza mais (aumenta as bolas aéreas do time) e chuta menos.
- **Falso 9:** tira força do ataque e põe no meio, e tira um pouco da defesa adversária (puxa o zagueiro). O time cabeceia menos, porque ninguém fica na área.
- **Pivô:** segura a bola e ganha no alto: mais bolas aéreas, força conta mais.
- **Atacante sombra:** chega de trás para finalizar: chuta quase como atacante, ajuda pouco no meio.
- **Regista:** reforça o meio e o contra-ataque com passe longo.
- **Lateral invertido:** vira meio-campista no ataque: mais meio, menos cruzamento.
- **Ala ofensivo:** mais ataque e cruzamento, menos defesa.
- **Xerife / Zagueiro construtor:** mais defesa e força, ou mais passe e meio.
- **Goleiro-líbero:** corta o contra-ataque adversário, como o playstyle de mesmo nome.

### Função com playstyle

Quando o jogador tem um playstyle que combina com a função, ele rende um pouco mais nela: Corta pra dentro com Chute de longe ou Driblador, Falso 9 com Passe preciso, Pivô com Trator ou Cabeceador, Regista com Passe em profundidade, Ala ofensivo com Cruzador ou Incansável.

### O que muda no código

- `LineupSlot` ganha um campo opcional com a função. Escalações antigas continuam valendo com a padrão, mas o save sobe de versão (regra do CLAUDE.md).
- `roles.ts` ganha as funções novas, com o setor de cada uma, em vez de só as que aparecem em alguma formação.
- A escalação da carreira e a do draft (`RoomLineup`) ganham a escolha. As funções do Supabase (`room-round`) precisam ser publicadas de novo, porque usam o motor.
- Testes de equilíbrio: nenhuma função pode ser melhor que as outras em tudo. A ideia é cada uma trocar algo por algo.

### Como ficou

- **Onde escolher:** na escalação, tocar num titular (no campo ou na lista) abre "Função de Fulano", com todas as funções do setor da vaga e a nota dele em cada uma. A mesma tela vale na carreira e nas salas do draft.
- **Padrão:** sem escolha, a vaga joga a função da formação, como antes, e a IA não escolhe funções. Assim o equilíbrio das partidas sem escolha fica igual ao de hoje. A ficha continua mostrando a "Melhor função", agora entre todas as do setor.
- **A função fica com a vaga:** trocando dois jogadores de lugar, quem entra na vaga herda a função escolhida, e o mesmo vale para quem entra numa substituição. Mudar a formação ou escalar automaticamente volta todas as vagas para a função da formação.
- **Ponta aberta:** é a própria Ponta esquerda ou direita (PE e PD). As funções que pertencem a um lado (PE, PD, ME, MD) não aparecem nas vagas do outro lado; numa vaga central, aparecem as dos dois lados.
- **Corta pra dentro:** rende 3% a mais no lado contrário ao pé bom e 3% a menos no mesmo lado; numa vaga central não há lado.
- **Playstyle que combina:** cada nível de um playstyle que combina com a função escolhida rende 1,5% a mais.
- **Equilíbrio:** com as mesmas sementes, trocar a função de uma vaga muda o saldo médio de gols do time em no máximo uns 0,09 por jogo, para mais ou para menos. A exceção são as funções de ataque numa vaga de volante (até 0,12), que ficam abaixo do Meia ofensivo nessa vaga, que já existia (0,2). O motor premia o ataque, então funções mais ofensivas tendem a render um pouco mais; as defensivas trocam gols marcados por gols sofridos.
- **Save na versão 15:** só o número sobe. A escalação ganhou o campo opcional `duty` em cada vaga, e saves antigos abrem com todas as vagas na função da formação.

## Ajustes depois do primeiro teste

Pedidos do Lugon de 21/10/2026, depois de jogar o draft:

- **Menos funções, sem repetir os playstyles.** Saíram Goleiro-líbero, Xerife, Zagueiro construtor, Box-to-box e Pivô, que faziam o mesmo que os playstyles Goleiro-líbero, Muralha e Trator, Passe em profundidade, Incansável e Cabeceador. Ficaram as seis que mudam o jeito de jogar: Ala ofensivo, Lateral invertido, Regista, Atacante sombra, Corta pra dentro e Falso 9, além das funções das formações. O goleiro não tem mais escolha.
- **Escalações que tinham uma função que saiu** perdem só a função: a vaga volta à da formação, e o resto da escalação fica. Isso vale nas salas (antes de conferir a escalação salva) e na carreira (save na versão 16).
- **Jogador de geral alto sem playstyle.** Era a regra: perto do topo da escala, os atributos esbarram no 99 e quase não conseguem ficar acima do normal para o geral. No Brasileirão do draft, 20 dos 209 jogadores de 70 a 79 e 6 dos 49 de 80 para cima não tinham nenhum, como o Pedro (86). Agora quem tem geral 65 ou mais tem pelo menos um playstyle, e de 80 para cima pelo menos dois: os seus mais fortes, mesmo que não se destaquem tanto. Na carreira, o save na versão 16 aplica isso a todo mundo; nas salas, vale para as salas criadas depois de publicar `room-draft`.
- **Trocar a função tira a seleção do jogador**, para a escalação não ficar com um jogador marcado à espera de troca.
- **Ponta para qualquer atacante** (22/10/2026). Antes, Ponta esquerda e Ponta direita só apareciam nas vagas de ponta. Agora uma vaga central (centroavante, meia, volante) também pode escolher as funções de lado, dos dois lados: o atacante de um 4-4-2 pode jogar aberto. Nada muda no save, porque a escolha só ficou mais larga.

## Para ligar no ar

O site da Vercel publica sozinho quando o PR entra na `main`, então a carreira já fica com tudo: os playstyles, os efeitos novos e as funções. Não há migração nova do banco. O que falta é o Supabase, que roda o motor nas salas do draft:

1. Publicar de novo as três funções que usam o motor: `supabase functions deploy room-round room-draft room-market`.
   - `room-round` joga as rodadas e confere a escalação salva. Sem ela, as funções escolhidas são ignoradas nas partidas das salas, e os playstyles novos não têm efeito.
   - `room-draft` cria as salas. Sem ela, as salas novas sorteiam os playstyles do jeito antigo.
   - `room-market` aplica trocas e dispensas, e usa o mesmo estado da sala.
   - `room-notify`, `pass` e `mercadopago-webhook` não mudaram e não precisam ser publicadas.
2. Salas que já existem guardam os jogadores do dia em que foram criadas, então mantêm os playstyles que tinham. As funções e os efeitos novos valem nelas a partir da primeira rodada jogada depois do passo 1.
3. Nada muda nos segredos nem nas tabelas.
