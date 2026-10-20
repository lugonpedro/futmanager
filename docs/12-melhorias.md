# Novo plano de melhorias

Pedido de 20/10/2026. Duas partes: primeiro, o que os planos antigos ([02](02-plano-pos-mvp.md), [03](03-melhorias.md), [04](04-partida.md), [05](05-online.md), [07](07-melhorias-carreira.md) e [09](09-responsividade.md)) pediam e o que já está na `main` (conferido no código do commit `6cadfa0`, PR #53); depois, as melhorias novas, começando pelos três pedidos de hoje.

## Parte 1: o que já foi feito

### Resumo

| Plano                        | Itens                                                             | Situação                                   |
| ---------------------------- | ----------------------------------------------------------------- | ------------------------------------------ |
| 02 Pós-MVP                   | Fases 8 a 12: menus, campo 2D, calendário, cartas, editor, contas | Feito (PRs #10 a #15)                      |
| 02 Pós-MVP                   | Fase 13: ligas com amigos                                         | Virou a Fantasia (plano 05); ver abaixo    |
| 02 Pós-MVP                   | Fase 14: Pix, continental, seleções, lojas                        | Só o pagamento foi feito                   |
| 03 Melhorias antes das ligas | M1 a M9                                                           | Feito (PRs #17 a #28)                      |
| 04 Partida                   | P1 a P6                                                           | Feito (PRs #22 a #24, e #53 no campo)      |
| 05 Online                    | O1 a O7: fantasia, ligas privadas, passe, avisos                  | Feito (PRs #31 a #37; Mercado Pago no #50) |
| 05 Online                    | A1 a A4: liga de carreira entre amigos                            | Não feito                                  |
| 07 Carreira e Ajuda          | 11 itens                                                          | Feito (PRs #41 a #45)                      |
| 09 Responsividade            | 8 itens                                                           | Feito (PRs #47, #49 e #52)                 |

### Plano 03, item a item

| Etapa | O que era                                               | Situação | Onde está                                                              |
| ----- | ------------------------------------------------------- | -------- | ---------------------------------------------------------------------- |
| M1    | Notificações e confirmação antes de simular             | Feito    | `src/ui/news.ts`, `announce.ts`, `confirm.ts` (PR #17)                 |
| M2    | Tela inicial com aviso de onde ficam os saves           | Feito    | `HomeScreen.tsx` (PR #18)                                              |
| M3    | Seleção da rodada em lista                              | Feito    | Visão geral (PR #19)                                                   |
| M4    | Mais formações e elenco mais largo                      | Feito    | PR #20; as funções do plano 07 substituíram as "linhas"                |
| M5    | Clube numa página só                                    | Feito    | PR #21; depois Finanças voltou a ter aba própria (plano 07, item 9)    |
| M6    | Partida                                                 | Feito    | PRs #22 a #24                                                          |
| M7    | Patrocínio master com contratos                         | Feito    | `finance/sponsors.ts` (PR #25), com manga, costas e calção depois      |
| M8    | Evolução mensal, treino, empréstimo, potencial em faixa | Feito    | `progression/`, `transfer/loans.ts` (PR #26), treino individual no #29 |
| M9    | Pacote com o Brasileirão 2026                           | Feito    | `src/packs` (PRs #27 e #28)                                            |

### O que ficou para trás

Coisas que os planos antigos citaram como "depois" e que não existem no código:

- **"Ver lance" nos jogos da carreira** (plano 02, fase 8.5). O `MatchReplay` existe, mas só é usado na rodada da Fantasia.
- **Ampliação do estádio** (plano 02, fase 8: "no futuro, ampliação"). A capacidade é fixa desde a criação do mundo.
- **Material esportivo e naming rights** (plano 03, M7). Entraram manga, costas e calção no lugar.
- **Nível de dificuldade** (plano 07, item 4: "se um dia tiver, o difícil esconde as setas").
- **Assistências**: o motor não registra quem deu o passe, por isso a seleção da rodada e a ficha não mostram.
- **Liga de carreira entre amigos** (plano 05, A1 a A4), **competição continental**, **seleções** e **lojas de celular** (plano 02, fase 14).
- **Prints da página Aprenda desatualizados**: foram tirados em 17/10, antes da troca de nome para onzemestre (#48) e das mudanças no elenco, no treino e na partida (#47, #49, #52, #53).
- **Documentação no repositório**: `docs/` vai só até o 09 e o README ainda lista só até o 03.

---

## Parte 2: melhorias novas

| #   | O que entrega                                 | Tamanho | Mexe no save?   | Origem            |
| --- | --------------------------------------------- | ------- | --------------- | ----------------- |
| N1  | Filtros melhores no mercado                   | Pequeno | Não             | Pedido de hoje    |
| N2  | Favoritar jogador                             | Pequeno | Sim (versão 13) | Pedido de hoje    |
| N3  | Desfalques: troca manual em vez de automática | Médio   | Não             | Pedido de hoje    |
| N4  | Rever os gols dos jogos da carreira           | Médio   | Não             | Sobra do plano 02 |
| N5  | Ampliação do estádio                          | Médio   | Sim             | Sobra do plano 02 |
| N6  | Prints da Aprenda e documentação em dia       | Pequeno | Não             | Manutenção        |
| N7  | "Estava à venda" também na tela de propostas  | Pequeno | Não             | Pedido de hoje    |

Ordem sugerida de PRs:

1. **Mercado e elenco**: N1, N2, N3 e N7 juntos. São os pedidos de hoje e mexem nas mesmas telas (Mercado, Time, Visão geral). Sobe o save uma vez, para a 13. Este documento entra nesse PR como `docs/12-melhorias.md`.
2. **Rever os gols**: N4 sozinho.
3. **Estádio**: N5 sozinho, porque mexe no dinheiro e pede `npm run balance`.
4. **Prints e docs**: N6 por último, para os prints já mostrarem as telas novas.

Os itens maiores (dificuldade, assistências, liga de carreira, continental) ficam no fim deste documento como ideias, sem ordem.

---

## N1. Filtros melhores no mercado

**Hoje**: a aba Contratar (`BuyTab` em `MarketScreen.tsx`) filtra por posição, "Cabem no caixa", ordem (geral, preço, idade) e busca por nome. Com a janela **fechada** ela mostra só os sem clube; com a janela **aberta** não tem como ver só eles, que são justamente os que saem de graça.

**Proposta**: uma linha de filtros a mais, e no celular todos os filtros vão para uma gaveta "Filtros (3)", com o número de filtros ligados.

- **Situação**: Todos, **Sem clube**, **Contrato no fim** (contrato que termina nesta temporada, `contractUntil === season.year`). (Pegar emprestado de outro clube não existe no motor, só emprestar os seus, então não entra filtro de empréstimo.)
- **Idade**: Todas, até 21, 22 a 29, 30 ou mais.
- **Geral mínimo** e **potencial mínimo**: um campo numérico cada, ou um seletor de 5 em 5.
- **Função**: VOL, MEI, PE/PD etc., pela melhor função do jogador (o mesmo cálculo da ficha). Só aparece quando a posição escolhida tem mais de uma função.
- **Divisão**: Série A, Série B, sem clube.
- **Salário cabe**: o salário pedido (`wageDemand`) cabe na folha sem deixar o caixa negativo em 3 meses. Mais útil que "Cabem no caixa" para os sem clube, que custam R$ 0 de transferência.
- Ordenar ganha **Potencial** e **Salário**.
- Botão **Limpar filtros**. Os filtros ficam guardados enquanto o jogo está aberto (no `store`), para não sumirem ao abrir a carta de um jogador e voltar.

**Decidido**: "sem contrato" é o jogador **sem clube**, e o filtro **Contrato no fim** entra também. O desconto no último ano de contrato fica de fora por ora, para não mexer no equilíbrio do mercado.

**Código**: `MarketScreen.tsx` (`BuyTab`), um `MarketFilters.tsx` novo, `bestRole` de `match/roles.ts`. Teste puro da função que aplica os filtros (`marketFilter.test.ts`).

**Como ficou (PR 1)**: na linha de cima, posição, **situação** (qualquer, sem clube, contrato no fim, favoritos) e a busca; o botão **Filtros** abre idade, divisão, geral mínimo, potencial mínimo, "Cabem no caixa" e a ordem (geral, potencial, preço, salário, idade), e mostra quantos estão ligados. Os filtros ficam guardados enquanto o jogo está aberto. Ficaram de fora o filtro por função e o "salário cabe", que podem vir depois. A lógica está em `src/ui/marketFilter.ts`, com testes.

## N2. Favoritar jogador

**Hoje**: não existe.

**Proposta**: uma **estrela** ao lado do nome, na lista do elenco e na carta do jogador (`PlayerSheet`).

- No **Time**, o filtro de posição ganha **Favoritos**, e os favoritos aparecem primeiro dentro de cada grupo.
- **Proteção**: vender, dispensar ou pôr à venda um favorito pede confirmação ("Fulano está nos favoritos. Vender mesmo assim?"). Uma proposta da IA por um favorito ganha um aviso mais forte.
- **Mercado**: a estrela também vale para jogadores de outros clubes, virando uma **lista de observação**. A aba Contratar ganha o filtro "Favoritos", e quando a janela abre um aviso lembra quem está na lista ("3 jogadores que você observa estão disponíveis").
- O favorito sai da lista sozinho se o jogador se aposentar.

**Save**: `GameState` ganha `favorites: string[]`. `SAVE_VERSION` sobe para 13, e o passo em `save.ts` começa com a lista vazia. Fica no save (e não no navegador) para ir junto na nuvem.

**Código**: `model/types.ts`, `save.ts`, `TeamScreen.tsx`, `PlayerSheet.tsx`, `MarketScreen.tsx`, `news.ts`.

**Como ficou (PR 1)**: estrela ao lado do nome no elenco, no mercado e na carta. O Time ganhou o botão **Favoritos**, e o Mercado a situação **Favoritos**, que serve de lista de observação. Pôr um favorito à venda ou aceitar proposta por ele pede confirmação, e o aviso de proposta por um favorito vem em amarelo. Os favoritos não sobem para o topo da lista, para não brigar com a ordenação, e o aviso de "jogador observado disponível" quando a janela abre ficou para depois. Save na versão 13.

## N3. Desfalques: troca manual

**Hoje**: quando um titular se lesiona ou é suspenso, aparece o aviso "Fulano se lesionou e só volta em 12/07" com "Ver time". Só que a escalação já vem trocada: `clubLineup` passa a escalação salva por `repairLineup` (`match/lineup.ts`), que tira quem não pode jogar e põe quem encaixa melhor. A página Time mostra a escalação já consertada, então o jogador nem vê o buraco.

**Proposta**:

- A escalação salva **não é mais consertada na tela**. Na página Time, o titular lesionado ou suspenso continua na vaga, com a linha em vermelho e o motivo ("lesionado até 12/07", "suspenso, 1 jogo"). No campo, a bolinha dele fica riscada.
- No topo da página, um aviso: "2 titulares não podem jogar o próximo jogo", com dois botões: **Trocar automaticamente** (faz o que o `repairLineup` faz hoje, uma vez, e salva) e **Escolher eu mesmo** (rola até a primeira vaga, para tocar no reserva).
- O aviso de lesão ou suspensão ganha o botão "Escolher substituto", que abre o Time já nesse aviso.
- **Antes do jogo**: "Jogar", "Simular jogo" e "Avançar" até um dia de jogo, com titular fora, abrem uma confirmação: "Fulano e Beltrano não podem jogar. Trocar automaticamente ou ajustar o time?". Não dá para entrar em campo com um jogador que não pode jogar.
- **Simulações longas** ("Simular até uma data", "Simular até o fim") continuam trocando sozinhas, como a confirmação delas já avisa, porque não dá para parar a cada lesão. Uma opção "Parar quando um titular ficar fora" na confirmação, desligada por padrão, faz parar.
- Uma caixa "Trocar desfalques automaticamente" no próprio aviso do Time, para quem prefere o jeito de hoje (o jogo não tem tela de configurações). Padrão: desligada, como pedido.
- Os clubes da IA continuam trocando sozinhos.

**Save**: não muda. A escalação salva já guarda os titulares originais; a diferença é só onde o conserto acontece. A preferência fica no navegador.

**Código**: `season.ts` (`clubLineup` ganha um modo "como está salva"), `TeamScreen.tsx`, `OverviewScreen.tsx` e o worker, que precisa recusar o jogo com desfalque quando a preferência está desligada. Teste: com a preferência desligada, `playMatchDay` com titular lesionado devolve um erro em vez de jogar.

**Como ficou (PR 1)**: o Time mostra a escalação como foi deixada, com quem não pode jogar o próximo jogo em vermelho e riscado (uma lesão que cura até o dia do jogo não conta). Um aviso no topo tem "Trocar automaticamente" e a caixa "Sempre trocar desfalques automaticamente", guardada no navegador. "Jogar ao vivo" e "Simular jogo" com desfalque abrem a confirmação com "Trocar automaticamente" ou "Escolher no Time". Quem nunca mexeu na escalação também é avisado: a escalação padrão passa a ser o melhor time, lesionados incluídos. "Simular até uma data" e "até o fim" continuam trocando sozinhos; a opção de parar quando um titular ficar fora ficou para depois. Os clubes da IA não mudam.

## N4. Rever os gols da carreira

**Hoje**: o campo 2D só aparece na partida ao vivo. Na Fantasia, o `MatchReplay` já re-simula o jogo pela semente e mostra o lance.

**Proposta**: nos resultados (Visão geral, Calendário, Competições), tocar num jogo já jogado abre o resumo dele, com os gols, os cartões e o botão **Ver lance** em cada gol, usando o mesmo `MatchReplay`. Como cada jogo tem semente própria (`matchSeed`), re-simular dá o mesmo resultado; o que precisa ser guardado é a escalação que cada time usou, porque o elenco muda depois. Isso já cabe em `season.results`? Conferir antes; se não couber, a escalação do jogo entra no save, e o save sobe.

## N5. Ampliação do estádio

**Hoje**: a capacidade é fixa (`stadiumCapacity`), e a seção Estádio só deixa mudar o preço do ingresso.

**Proposta**: na seção Estádio, **ampliar** em blocos de 5 mil lugares. A obra custa (por exemplo R$ 8 mi por bloco na Série A), leva alguns meses e a diretoria precisa aprovar se a confiança estiver baixa. Durante a obra o estádio perde uma parte da capacidade. O público médio e a renda passam a mostrar se vale a pena (quantos jogos lotaram). Clubes da IA também ampliam, devagar, com o caixa sobrando.

**Save**: a obra em andamento entra no `GameState`; a versão sobe. **Equilíbrio**: `npm run balance` antes e depois, olhando o caixa médio por divisão.

## N6. Prints e documentação

- Rodar `npm run learn:shots` de novo: os prints são de antes da troca de nome e das telas novas do elenco, do treino e da partida.
- Levar para `docs/` os documentos 10 e 11 que só estão na pasta do projeto, e este 12. O README passa a listar todos.

## N7. "Estava à venda" na tela de propostas

**Hoje**: o aviso de proposta diz "que estava à venda" ou "mesmo sem ele estar à venda" (`news.ts`), mas a aba Propostas do Mercado (`OffersTab`), onde se aceita ou recusa, não diz.

**Proposta**: cada proposta mostra um selo **À venda** (com o preço pedido, "pedia R$ 3 mi") ou **Não estava à venda**, e a diferença entre a oferta e o preço pedido ("10% abaixo do pedido").

**Save**: a proposta passa a guardar o preço pedido no momento em que chegou (`TransferOffer.askingPrice`, opcional), para o selo não mudar se o jogador sair da lista depois. Propostas de saves antigos usam a lista atual.

---

**Como ficou (PR 1)**: cada proposta mostra "À venda por R$ 4,9 mi" com a diferença ("13% abaixo") ou "Não estava à venda". O aviso de proposta usa o mesmo dado.

## Ideias para depois

Sem ordem e sem detalhe, para decidir quando chegar a vez:

- **Nível de dificuldade**: fácil mostra as setas do treino e o potencial mais preciso; difícil esconde as setas, alarga a faixa de potencial e deixa a diretoria mais exigente.
- **Assistências**: o motor passa a escolher quem deu o passe em cada gol. Entra na seleção da rodada, na ficha e na pontuação da Fantasia (o que mexe nos preços dela).
- **Liga de carreira entre amigos** (plano 05, A1 a A4): a parte grande é o `GameState` com vários técnicos.
- **Competição continental** e **seleções** (plano 02, fase 14).
- **Material esportivo e naming rights** no patrocínio.
- **Lojas de celular** (Capacitor), com a compra do passe pela loja.

## Decisões

Fechadas em 20/10/2026:

1. **N1**: o filtro principal é **Sem clube**, e **Contrato no fim** entra também. Sem desconto no último ano de contrato.
2. **N3**: a troca passa a ser manual, com a opção "Trocar desfalques automaticamente" para quem prefere o jeito de hoje.
3. **N7** entra no primeiro PR, junto de N1 a N3.
