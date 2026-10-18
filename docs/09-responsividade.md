# Responsividade no Celular

Plano para o pedido de 17/10/2026: no computador dá para ver tudo, mas no celular algumas informações somem. Os dois exemplos do pedido foram o ícone de renovar, que devia ficar vermelho quando o contrato está para vencer, e o treino, que no celular só aparece na lista de baixo, complexa demais para o que faz.

O levantamento usou o código do commit `51384d6` e prints de uma carreira com o Corinthians em junho de 2027, numa tela de celular de 390 px e numa de computador de 1280 px. Os prints estão na pasta do projeto, em `pesquisa/prints-09/`, fora do repositório. Nenhum item muda o formato do save.

## Resumo

| #   | Pedido                                        | Tela       | Tamanho | Prioridade |
| --- | --------------------------------------------- | ---------- | ------- | ---------- |
| 1   | Ícone de renovar em vermelho quando vence     | Time       | Pequeno | Alta       |
| 2   | Idade, condição e contrato de volta no elenco | Time       | Pequeno | Alta       |
| 3   | Treino mais simples, sem a lista repetida     | Time       | Médio   | Alta       |
| 4   | Idade e salário pedido no mercado             | Mercado    | Pequeno | Média      |
| 5   | Caixa e rodada no topo do celular             | Todas      | Pequeno | Média      |
| 6   | Partida ao vivo em abas no celular            | Partida    | Médio   | Média      |
| 7   | Nomes cortados no calendário                  | Calendário | Pequeno | Baixa      |
| 8   | Botões pequenos demais para o dedo            | Time       | Pequeno | Baixa      |

Ordem sugerida de PRs:

1. **Elenco no celular**: 1, 2, 4 e 8 juntos, porque usam o mesmo padrão de "linha de baixo" nas tabelas. Este documento entra nesse PR.
2. **Treino**: o 3, sozinho, porque muda como o jogador usa a tela.
3. **Ajustes gerais**: 5, 6 e 7.
4. Depois, `npm run learn:shots` para os prints da página Aprenda mostrarem as telas novas.

---

## A regra por trás

Hoje cada tabela esconde colunas no celular com `hidden sm:table-cell`, e a informação simplesmente some. Em vários casos o que some é justamente um alerta: o contrato em vermelho e a condição em amarelo. A frase "5 contratos terminam no fim desta temporada (em vermelho)" aparece no celular, mas nada fica vermelho na lista.

A regra proposta: **o que esconde no celular tem de reaparecer em outro lugar**, e **alerta nunca esconde**. Os lugares possíveis, em ordem de preferência:

1. Uma linha pequena embaixo do nome, na mesma célula (padrão novo, itens 2 e 4).
2. A cor ou um ícone num elemento que já aparece (item 1).
3. A carta do jogador, que abre ao tocar no nome e já mostra tudo.

---

## 1. Ícone de renovar em vermelho

**Hoje**: no celular a coluna Contrato some (`TeamScreen.tsx`, `COLUMNS`, `hide: 'hidden sm:table-cell'`). O único jeito de saber quem está para sair é abrir a carta de cada um. O ícone de renovar (`FilePenLineIcon`, no `RowAction` do `SquadRow`) é igual para todos.

**Proposta**: quando `contractUntil <= season.year`, o ícone de renovar fica vermelho (`text-destructive`), em qualquer largura de tela, e o `title` vira "Contrato de Fulano termina em 2027: renovar". O ícone de pôr à venda já faz algo parecido, ficando amarelo quando o jogador está à venda (`active`).

**Código**: uma prop `expiring` no `SquadRow`, passada para o `RowAction` de renovar, que ganha uma variante `danger` ao lado de `active`. No computador o ano em vermelho na coluna Contrato continua.

## 2. Idade, condição e contrato de volta no elenco

**Hoje**: no celular a lista do elenco tem só Pos, Nome e Geral (print `time-celular-topo.png`). Somem Idade, Cond (condição e forma), Salário e Contrato. A condição é a que mais faz falta, porque é ela que decide quem escalar antes de um jogo.

**Proposta**: no celular, embaixo do nome, uma linha em letra pequena e cinza com o que sumiu:

> **Matheus Bidu** `2 amarelos`
> 27 anos · 97% ↑ · até 2029

- A condição fica amarela abaixo de 85%, como na coluna do computador.
- O "até 2027" fica vermelho e em negrito quando o contrato vence na temporada.
- O salário fica só na carta, para a linha não ficar longa.
- A partir de `sm` a linha some e voltam as colunas, como hoje.

A linha aumenta um pouco a altura de cada jogador, mas evita abrir a carta de um em um. Uma alternativa estilo Brasfoot seria um seletor "Ver: Geral / Físico / Contrato" que troca a terceira coluna, mas é um toque a mais e esconde de novo dois dos três.

**Código**: dentro da célula do nome no `TeamScreen`, um `<div className="text-xs text-muted-foreground sm:hidden">` com idade, `p.condition`, `FormArrow` e `p.contractUntil`. Vale extrair um pequeno componente `RowDetails`, porque o item 4 usa o mesmo formato.

## 3. Treino mais simples

**Hoje** o treino individual aparece em dois lugares:

- **Na lista do elenco**, a coluna Treino com o seletor de foco. No celular ela só aparece quando se liga o filtro "Podem treinar", que troca os botões de vender e renovar pelo seletor (`trainingColumn` e `actionsColumn`). Pouca gente descobre isso.
- **No cartão Treino**, embaixo de tudo (`TrainingPanel.tsx`), com o foco do elenco e uma linha por jogador: barra de potencial, seletor de foco e os três botões Leve, Normal e Intenso. No elenco do print são 18 linhas, umas 1.800 px de rolagem no celular (prints `time-celular-treino.png` e `time-celular-treino-lista.png`), quase sempre com "Nenhum" e os botões apagados.

No computador as duas listas aparecem ao mesmo tempo, uma embaixo da outra, com o mesmo seletor duas vezes para cada jogador (`time-computador.png`).

**Proposta**: o cartão Treino fica só com as decisões do elenco inteiro, e o um a um fica na lista e na carta.

O cartão Treino passa a ter:

1. **Foco do elenco**: os botões Equilibrado, Físico, Técnico, Tático e Descanso, como hoje.
2. **Treino individual**: "7 de 18 com plano próprio", com os botões "Todos no recomendado" e "Tirar todos".
3. **Intensidade de todos**: Leve, Normal e Intenso, aplicada a todos que têm plano. Se houver intensidades diferentes, nenhum botão fica marcado e aparece "intensidades variadas".
4. **"Escolher um por um"**: um botão que liga o filtro "Podem treinar" e rola a tela até a lista do elenco, onde o seletor de foco já está.
5. As frases "Já no potencial" e "Acima de 30 anos", como hoje.

As 18 linhas com barra e botões saem. O que se perde:

- **A barra de potencial**: o "82/86" já aparece na coluna Geral.
- **O "+1 no último mês"**: passa para a coluna Geral da lista, ao lado do potencial, em verde ou vermelho.
- **A intensidade de um jogador só**: passa para a carta do jogador.

Na carta (`PlayerSheet.tsx`), o item "Treino", que hoje só mostra texto, ganha o seletor de foco (`FocusSelect`) e os três botões de intensidade, para quem quer, por exemplo, deixar só um jogador no intenso.

O botão "Podem treinar" passa a se chamar "Escolher treino", para ficar claro que no celular ele troca os botões de vender e renovar pelo seletor de treino.

**Como ficou (PR 2)**: como proposto. O "+1 no último mês" aparece na coluna Geral em qualquer tela, e a página Aprenda explica onde escolher o treino de cada um.

**Código**:

- `TrainingPanel.tsx`: tira o `PlanRow` e a lista. Junta `setSquadFocus`, `setRecommendedPlans` e `setSquadPlans`, como hoje, e uma função nova `setSquadIntensity(game, intensity)` em `training.ts`, que muda só a intensidade dos planos já existentes. É pura e testável, mas não muda o formato do save.
- `TeamScreen.tsx`: o "Escolher um por um" precisa de um jeito de ligar `trainableOnly` a partir do painel. O caminho mais simples é levar o estado para o próprio `TeamScreen` e passar `onPickOneByOne` ao `TrainingPanel`, com `scrollIntoView` na lista.
- `PlayerSheet.tsx`: o item Treino usa `FocusSelect` e `Choices`, os mesmos componentes que saem do `PlanRow`.
- Teste novo para `setSquadIntensity` e ajuste da cena "treino" do `scripts/learn-shots.ts`.

## 4. Idade e salário pedido no mercado

**Hoje**: no celular a lista de contratação mostra Pos, Nome, Geral, Clube e Preço. Idade e Salário pedido somem (`MarketScreen.tsx`), e as duas pesam na hora de comprar.

**Proposta**: a mesma linha pequena do item 2, embaixo do nome: "FLA · 24 anos · pede R$ 210 mil". A coluna Clube, que já usava a sigla, sai no celular e a sigla vai para essa linha. Assim sobra espaço para o preço, que numa tela de 360 px ficava cortado na borda.

**Código**: o `RowDetails` do item 2.

## 5. Caixa e rodada no topo do celular

**Hoje**: no computador a barra da esquerda mostra a série, a rodada, a data e o caixa o tempo todo. No celular o topo mostra só "SCCP · sáb, 26/06". O caixa e a rodada ficam escondidos no menu ☰.

**Proposta**: o topo do celular fica com "SCCP · 26/06 · R$ 11,3 mi". A rodada já aparece no Resumo e no Calendário, então não precisa ir para o topo. Quando o caixa estiver negativo, o valor fica vermelho.

**Código**: o `<header>` do `GameLayout.tsx`, com `formatMoney(club.cash)` em versão curta. Testar em tela de 360 px, a menor comum, para o título da página não sumir.

**Como ficou (PR 3)**: como proposto. Em 360 px cabe "Competições", o título mais longo, ao lado de "SCCP · 26/06 · R$ 11,3 mi".

## 6. Partida ao vivo em abas

**Hoje** (visto no código, sem print desta vez): no computador as estatísticas e as notas ficam numa coluna à direita (`LiveMatchScreen.tsx`, `lg:grid-cols-[minmax(0,1fr)_20rem]`). No celular elas descem para baixo do campo, dos lances e dos controles, e é preciso rolar a tela no meio do jogo para ver quem está mal.

**Proposta**: abaixo de `lg`, o que fica embaixo do placar e do campo vira três abas: **Lances**, **Estatísticas** e **Notas**. Os controles (substituições, postura) ficam fixos acima das abas, porque são o que se usa durante o jogo.

**Código**: `Tabs` do shadcn em volta de `MatchFeed`, `MatchStats` e `MatchRatings`, só abaixo de `lg`. No computador continua como está.

**Como ficou (PR 3)**: as abas ficaram logo abaixo do campo, e os controles foram para baixo delas. Nos prints, o cartão de substituições ocupa quase uma tela inteira, e com ele em cima os lances iam parar longe do campo.

## 7. Nomes cortados no calendário

**Hoje**: na lista de jogos do celular, quando a linha tem o resultado e os pênaltis, o nome do adversário corta ("Flamen...", print `calendario-celular.png`).

**Proposta**: no celular, usar a sigla do adversário quando a linha tem placar, e o nome inteiro nos jogos que ainda vão acontecer.

**Código**: a linha do dia na versão de celular do `CalendarScreen.tsx`.

**Como ficou (PR 3)**: como proposto, e o placar com pênaltis ("V 1-1 pên.") não quebra mais linha.

## 8. Botões pequenos demais para o dedo

**Hoje**: os ícones de vender e renovar da lista do elenco têm 28 px (`size-7`), abaixo dos 44 px que o Android e o iOS recomendam, e ficam colados. Um toque errado abre o diálogo de vender em vez do de renovar.

Pior: medindo a lista, a tabela já era mais larga que a tela do celular. Em 390 px o ícone de renovar ficava meio cortado, e em 360 px ficava fora da tela, só aparecendo ao arrastar a tabela para o lado.

**Proposta**: no celular, área de toque de 36 px com o mesmo ícone, e o nome e as etiquetas ("1 amarelo") podem quebrar linha, para a tabela caber na tela. Uma alternativa é juntar os dois num botão "⋯" com um menu Vender / Renovar, mas aí o ícone vermelho do item 1 perde a força. Fica a primeira opção.

**Código**: classe `size-9 sm:size-7` no `RowAction` e `whitespace-normal sm:whitespace-nowrap` na célula do nome.

---

## O que foi conferido e está bem no celular

- **Resumo**, **Finanças** e **Clube**: os cartões empilham e nada some.
- **Classificação**: somem Gols pró, Gols contra e Últimos jogos. O saldo de gols continua, que é o que importa para a posição. Fica como está.
- **Carta do jogador**: ocupa a tela toda e mostra tudo, inclusive contrato e salário.

## Como testar

Para cada PR, prints em 360 px, 390 px e 1280 px das telas mexidas, com a mesma carreira de semente fixa do `scripts/learn-shots.ts`, e os quatro comandos do `CLAUDE.md` (`lint`, `format:check`, `test`, `build`).
