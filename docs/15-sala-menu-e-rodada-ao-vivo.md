# Sala: menu lateral e rodada ao vivo

Plano de 21/10/2026, pedido pelo Lugon depois do FUT Draft (PRs #74 e #76). São duas mudanças na página da sala depois do draft (`/sala/:id`, nas fases liga e encerrada):

1. **Menu lateral como o da carreira**, com uma página para cada parte da liga, no lugar da pilha de cards de hoje.
2. **Rodada ao vivo:** quando todos dão "Pronto", a sala mostra a partida no campinho 2D antes de mostrar os resultados.

As duas dá para fazer sem mexer no motor. O campinho (`MatchPitch`) e o replay (`MatchReplay`) já existem, e a rodada já guarda o replay de cada jogo em `room_rounds.replays`.

## Como está hoje

`LeagueView` (`src/ui/components/League.tsx`) mostra tudo numa coluna só, nesta ordem:

1. "Pronto" (ou o fim da liga)
2. Resultados da rodada
3. Escalação (`RoomLineup`)
4. Mercado (`MarketView`)
5. Tabela
6. Próxima rodada
7. Artilharia

No celular isso vira uma rolagem longa, e o mercado sozinho já ocupa uma tela inteira. Quando a rodada é jogada, a tabela e os resultados mudam na hora, e o jogo só pode ser visto depois, pelo botão de assistir.

## Parte 1: menu lateral e uma página para cada parte

### As páginas

| Página      | Endereço            | O que tem                                                                                                                         |
| ----------- | ------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **Resumo**  | `/sala/:id`         | O "Pronto" (ou o fim da liga com campeão e revanche), seu próximo jogo, os resultados da última rodada e os 4 primeiros da tabela |
| **Time**    | `/sala/:id/time`    | Escalação e elenco, com a formação e o banco                                                                                      |
| **Mercado** | `/sala/:id/mercado` | Livres, propostas e dispensas; as abas atuais do mercado viram abas da página                                                     |
| **Tabela**  | `/sala/:id/tabela`  | Classificação e artilharia em abas, como em Competições na carreira                                                               |
| **Rodadas** | `/sala/:id/rodadas` | Todas as rodadas jogadas, cada jogo com o botão de assistir, e as próximas                                                        |
| **Sala**    | `/sala/:id/sala`    | Quem está na sala, as regras, o histórico do draft e o apagar sala para o dono                                                    |

A página Rodadas é nova. Hoje só a última rodada aparece, mas cada linha de `room_rounds` guarda o resumo daquela rodada, então dá para listar todas sem mudar o banco.

### O layout

É o mesmo esquema de `GameLayout`, num `RoomLayout` novo:

- **Computador:** coluna lateral fixa com o escudo e o nome do seu time, o nome da sala, a rodada ("Rodada 7 de 14") e os links. Os links trazem marcas: um ponto no Resumo enquanto você não deu "Pronto", e o número de propostas novas no Mercado.
- **Celular:** barra no topo com o menu de gaveta (Sheet) e uma barra de baixo com 5 ícones (Resumo, Time, Mercado, Tabela, Rodadas). A página Sala fica só na gaveta.
- A sala de espera e o draft continuam como estão. O menu aparece só quando a liga começa.

### Os dados

Hoje o `LeagueView` carrega tudo e ouve o realtime num lugar só. Isso passa para o `RoomLayout`, que entrega os dados às páginas pelo contexto do `Outlet` (react-router). Assim:

- continua um canal realtime por sala, e trocar de página não carrega nada de novo;
- cada página vira um componente pequeno, recortado do `League.tsx` atual (que tem 571 linhas e encolhe bastante).

Rotas novas em `App.tsx`: `/sala/:id` passa a ter rotas filhas. O `RoomScreen` decide pela fase: espera e draft como hoje, liga e encerrada dentro do `RoomLayout`.

## Parte 2: rodada ao vivo no campinho

### Como fica

Quando todos dão "Pronto" (ou o dono joga a rodada), a página de todos na sala abre a **Rodada ao vivo**:

- o seu jogo no campinho 2D, com placar, minuto, lances e estatísticas, como no `MatchReplay`;
- ao lado (embaixo no celular), os placares dos outros jogos da rodada, mudando minuto a minuto, como no dia de jogo da carreira;
- quando os jogos acabam, a tela passa para os resultados e a tabela nova;
- o botão "Pular para o fim" leva direto aos resultados para quem não quiser esperar.

Quem não tem time (só olhando) vê o jogo do líder ou escolhe qual assistir na lista.

### Sem spoiler

A rodada já está toda jogada no servidor quando a tela abre. Para não estragar a surpresa, enquanto a rodada ao vivo não acaba (ou até você pular), as páginas Resumo, Tabela e Rodadas continuam mostrando a rodada anterior, com um aviso de "Rodada ao vivo" que leva de volta ao jogo. Para isso:

- o cliente guarda qual rodada você já viu acabar (no `localStorage`, por sala), e a tabela nova aparece quando você termina ou pula;
- a rodada anterior vem de `room_rounds` (o resumo da rodada `n - 1`), que já existe.

### Todos ao mesmo tempo

A ideia é todos verem o mesmo minuto, como numa transmissão. O replay é determinístico, então todo cliente calcula a mesma linha do tempo dos lances. A partida começa em `room_rounds.played_at` (coluna que já existe), e quem abre a página no meio do jogo entra no minuto em que ele está. Quem chega depois do fim vê direto os resultados, com o botão de assistir como hoje.

O que isso pede no código:

- uma função que, dado o replay e a velocidade, diz em que lance o jogo está depois de t milissegundos (`replayAt`, ao lado de `playDuration` em `src/ui/pitchScene.ts`). O `MatchReplay` ganha um modo "ao vivo", que começa nesse ponto e fica sem pausar, voltar ou mudar a velocidade;
- uma velocidade fixa para todos. Pela soma das durações dos lances com `PLAY_SPEEDS.Normal`, uma partida no campinho deve durar uns 3 a 5 minutos, e eu meço isso nos replays reais antes de fixar. Se ficar longo, uso o "Rápido".

A alternativa mais simples é cada um assistir no seu ritmo, com pausa e velocidade, começando do zero quando abre. Ela perde a graça de ver o gol do amigo na mesma hora, então recomendo o modo sincronizado.

### Avisos

O aviso de "rodada jogada" (D6) passa a dizer "A rodada começou, venha assistir", e o link abre a Rodada ao vivo.

## Ordem dos PRs

| Passo | O que entra                                                                                                         | Tamanho      |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ------------ |
| M1    | `RoomLayout` com o menu, rotas filhas e as páginas Resumo, Time, Mercado, Tabela e Sala, recortadas do `League.tsx` | Médio        |
| M2    | Página Rodadas, com todas as rodadas jogadas e o botão de assistir                                                  | Pequeno      |
| M3    | Rodada ao vivo: `replayAt`, modo ao vivo no `MatchReplay`, placares dos outros jogos, tela de fim, sem spoiler      | Médio/grande |
| M4    | Texto do aviso e acertos depois de testar com a turma                                                               | Pequeno      |

Os passos M1 e M2 só mexem no app, sem banco. O M3 também não precisa de banco, só usa `played_at` e `replays`, que já existem.

## O que preciso que você decida

1. **Rodada ao vivo sincronizada** (todos no mesmo minuto, sem pausar) **ou cada um no seu ritmo?** Recomendo a sincronizada, com o botão de pular.
2. **As páginas da tabela estão boas?** Em especial: juntar Tabela e Artilharia numa página com abas, e criar a página Rodadas.
3. **Barra de baixo no celular:** Resumo, Time, Mercado, Tabela e Rodadas, com a página Sala na gaveta. Serve assim?
