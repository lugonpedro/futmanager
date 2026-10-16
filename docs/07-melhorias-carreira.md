# Melhorias da Carreira e da Ajuda

Plano para os 11 pedidos de 16/10/2026 sobre a Carreira e a página Aprenda (a "Ajuda"). Cada item diz o que muda para o jogador, onde mexe no código (commit `cc28571`) e o tamanho. São cinco PRs, na ordem abaixo; o primeiro traz este documento.

## Resumo

| #   | Pedido                                    | Tamanho | Mexe no save? |
| --- | ----------------------------------------- | ------- | ------------- |
| 1   | Posição na tabela no confronto do Resumo  | Pequeno | Não           |
| 2   | Notificações empilhadas                   | Pequeno | Não           |
| 3   | Funções (volante etc.) e campo por padrão | Grande  | Sim           |
| 4   | Setas de sugestão no treino individual    | Pequeno | Não           |
| 5   | Treino dentro da lista do elenco          | Médio   | Não           |
| 6   | Mercado com a janela fechada              | Pequeno | Não           |
| 7   | Ver elenco e formação de outros times     | Médio   | Não           |
| 8   | Simular até uma data no calendário        | Médio   | Não           |
| 9   | Finanças numa aba própria                 | Pequeno | Não           |
| 10  | Só tema claro e escuro, escuro por padrão | Pequeno | Não           |
| 11  | Prints na página Aprenda                  | Médio   | Não           |

Ordem sugerida de PRs:

1. **Ajustes rápidos**: 1, 2, 6, 9 e 10 juntos. Nenhum muda regra do jogo.
2. **Treino**: 4 e 5 juntos, porque dividem a mesma conta de "quanto cada foco sobe o geral".
3. **Calendário e adversários**: 7 e 8.
4. **Funções táticas**: o 3, sozinho, porque mexe no motor, no save e no equilíbrio.
5. **Prints na Aprenda**: o 11 por último, para os prints já mostrarem as telas novas.

---

## 1. Posição na tabela no confronto

**Hoje**: o cartão "Próximo jogo" do Resumo mostra só "Atlético-MG x Bahia" (`FixtureLine` em `OverviewScreen.tsx`).

**Proposta**: a posição de cada time aparece ao lado do nome, em letra menor: **"3º Atlético-MG x Bahia 14º"**. Em jogo da liga é a posição na própria divisão; em jogo da copa, a posição de cada um na sua divisão (os dois podem ser de séries diferentes, então fica "3º A" e "8º B"). Antes da primeira rodada não aparece nada, porque todos estão empatados.

**Código**: `leagueStandings(game, leagueId)` (`season.ts`) já calcula a tabela. Uma função `tablePosition(game, clubId)` em `src/ui` e uma prop opcional `positions` no `FixtureLine`, usada só no Resumo para não poluir as outras listas.

## 2. Notificações empilhadas

**Hoje**: o `Toaster` em `App.tsx` usa `expand`, então cada aviso ocupa seu espaço e eles vão descendo a tela. Cada simulação já junta tudo em no máximo 3 avisos (`MAX_TOASTS` em `news.ts`), mas várias simulações seguidas somam.

**Proposta**:

- Tirar o `expand`: os avisos ficam **sobrepostos em pilha**, o mais novo na frente, e abrem em leque ao passar o mouse ou tocar, que é o comportamento padrão do Sonner.
- Limitar a pilha a 3 visíveis (`visibleToasts={3}`).
- Quando uma simulação nova anuncia novidades, os avisos da simulação anterior somem (`toast.dismiss` nos ids que o `announce` guardou), porque já ficaram velhos.

**Código**: `App.tsx` e `announce.ts`. Algumas linhas.

## 3. Funções táticas e o campo

**Hoje**: há só cinco posições (G, Z, L, M, A). O 4-1-4-1 e o 4-2-3-1 diferem do 4-5-1 apenas no desenho (`MIDFIELD_LINES` em `lineup.ts`); no motor, um volante e um meia ofensivo valem o mesmo. O campo fica escondido atrás do botão "Ver no campo".

**Proposta**: cada vaga da formação passa a ter uma **função**, além da posição. A posição do jogador (G, Z, L, M, A) continua igual; a função diz o que se espera dele naquela vaga.

| Posição | Funções                                                               |
| ------- | --------------------------------------------------------------------- |
| G       | Goleiro                                                               |
| Z       | Zagueiro                                                              |
| L       | Lateral, Ala (no 3-5-2 e no 3-4-3, mais ofensivo)                     |
| M       | Volante (VOL), Meio-campista (MC), Meia ofensivo (MEI), Ponta (PE/PD) |
| A       | Centroavante (CA), Segundo atacante (SA)                              |

- **Formações** passam a ser listas de vagas com função. Exemplos: 4-1-4-1 = 1 VOL, 2 MC, 2 pontas, 1 CA; 4-2-3-1 = 2 VOL, 1 MEI, 2 pontas, 1 CA; 4-3-3 = 1 VOL, 2 MC, 2 pontas (como A), 1 CA. Dá para acrescentar o **4-4-2 losango** (VOL, 2 MC, MEI) e o **3-5-2 com alas**.
- **Geral na função**: cada função tem seus pesos, como as posições já têm em `OVERALL_WEIGHTS`. O volante pesa mais DEF e FIS; o meia ofensivo, PAS e DRI; a ponta, RIT e DRI. A carta do jogador mostra a melhor função dele ("M · melhor como Volante").
- **Motor**: o peso de cada titular em defesa, meio e ataque (`WEIGHTS` em `strength.ts`) passa a vir da função. Dois volantes protegem mais e atacam menos que dois meias ofensivos. As chances de gol também escolhem o finalizador pela função (ponta e centroavante mais, volante menos).
- **Encaixe**: a cor de encaixe na escalação (na posição, secundária, improvisado) passa a considerar a função. Um meia com DEF alta encaixa bem de volante; um meia leve, não.
- **Campo**: o desenho do `Pitch` posiciona cada função na sua altura e no seu lado (volante logo à frente da zaga, meia ofensivo atrás do atacante, pontas abertas). Cada jogador mostra a sigla da função em vez de "M".
- **Campo visível por padrão**: o `showPitch` começa ligado, e a escolha de esconder fica guardada no navegador (`localStorage`), como uma preferência.
- **Adversários**: a IA escolhe formação pelo elenco que tem, como já faz, e ganha as formações novas.

**Save**: `LineupSlot` ganha `role`. `SAVE_VERSION` sobe, e o passo novo em `save.ts` preenche a função de cada titular a partir da formação salva. Jogadores não mudam; a melhor função é calculada, não guardada.

**Equilíbrio**: rodar `npm run balance` antes e depois. A média de gols e a vantagem do mandante precisam ficar onde estão; as funções só redistribuem força entre os setores.

**Código**: `model/types.ts`, `match/lineup.ts`, `match/strength.ts`, `match/simulate.ts`, `player/attributes.ts`, `save.ts`, `components/Pitch.tsx`, `components/FormationSelect.tsx`, `TeamScreen.tsx`, `PlayerCard.tsx`. É o maior item do plano e vale um PR só para ele.

## 4. Setas de sugestão no treino

**Hoje**: o select do treino individual lista os nove focos (Geral, Finalização, Passe...) sem dizer qual ajuda mais aquele jogador.

**Proposta**: o jogo calcula, para cada foco, **quanto o geral do jogador subiria** se aqueles atributos crescessem um pouco, usando os pesos da posição (e da função, depois do item 3). Com isso:

- No select, os focos que mais sobem o geral ganham uma **seta verde para cima** (▲), e o melhor de todos ganha "▲ recomendado". Focos que quase não mexem no geral dele ficam sem seta. Exemplo: para um zagueiro, Defesa e Cabeceio aparecem com seta; Finalização não.
- O "Geral" continua existindo e continua sendo o que mais sobe o geral no total, porque trabalha os atributos-chave da posição. As setas servem para quem quer especializar o jogador sem perder geral, ou para cobrir o ponto fraco dele (o atributo da posição mais abaixo da média dele ganha a seta mesmo que outro some mais).
- **Dificuldade**: o jogo ainda não tem nível de dificuldade. Se um dia tiver, o fácil mostra as setas e o recomendado; o difícil esconde, e o jogador decide sozinho. Por ora as setas aparecem sempre.

**Código**: uma função pura `focusGains(player)` em `progression/training.ts`, que aplica um aumento fixo nos atributos de `FOCUS_ATTRIBUTES[focus]` e compara `overallAt` antes e depois. Testes em `training.test.ts` (zagueiro recomenda Defesa, atacante recomenda Finalização, goleiro só Goleiro).

## 5. Treino dentro da lista do elenco

**Hoje**: o treino fica num cartão separado no fim da página Time, com sua própria lista de jogadores. Quem olha a lista do elenco não sabe quem pode treinar nem o que está treinando.

Três ideias, da mais simples à mais completa:

**A. Coluna "Treino" na lista do elenco.** Uma coluna nova na tabela do elenco com um chip pequeno: o foco atual ("Defesa · Normal"), "Sem treino" para quem pode treinar e está parado (em destaque, para chamar atenção), ou nada para quem já não pode (no potencial ou acima da idade). Tocar no chip abre um popover com o foco (com as setas do item 4) e a intensidade. No celular a coluna vira um ícone de halter ao lado do nome.

**B. Filtro "Podem treinar".** Junto dos filtros de posição da lista, um botão "Podem treinar" que mostra só os jogadores que ainda podem ter plano individual, e um aviso no topo quando alguém que pode treinar está sem plano ("4 jogadores sem treino. Colocar no recomendado").

**C. Aba Treino na página Time.** A página Time ganha duas abas, Escalação e Treino. A aba Treino tem o foco do elenco no topo e uma lista em cartões: nome, barra geral/potencial, ganho do último mês, foco com setas e intensidade. Botões "Todos no recomendado" (usa o melhor foco de cada um, do item 4) e "Tirar todos".

**Recomendação**: A + B juntas, e manter o cartão de treino atual só com o foco do elenco e os botões em lote. Isso põe o treino onde o jogador já está olhando, sem esconder nada atrás de uma aba. Se a lista do elenco ficar larga demais, cair para a C.

**Como ficou (PR 2)**: a coluna Treino usa o mesmo seletor de foco, com as setas, e a intensidade continua no cartão de treino. No celular não cabem a coluna e os botões de vender e renovar ao mesmo tempo, então o filtro "Podem treinar" troca um pelo outro. Acima da lista, um aviso conta quem pode treinar e está sem plano, com o botão "Colocar no recomendado". No cartão de treino, "Todos no geral" virou "Todos no recomendado". As setas consideram também o espaço que cada atributo ainda tem até 99: um zagueiro com marcação e desarme já no topo vê a seta em outro foco.

**Código**: `TeamScreen.tsx` (coluna e filtro), um componente `TrainingChip` reaproveitando o select do `TrainingPanel.tsx`, e `setSquadPlans` ganha a variante "recomendado".

## 6. Mercado com a janela fechada

**Hoje**: com a janela fechada a lista "Contratar" mostra todos os jogadores, e só ao fazer proposta aparece "Janela de transferências fechada: só dá para contratar jogador sem clube."

**Proposta**: com a janela fechada, a aba Contratar abre com um **aviso no topo** ("Janela fechada. Abre em 1º de julho.") e a lista mostra **só os jogadores sem clube**, que são os únicos que dá para contratar. Um botão "Ver todos para observar" mostra o resto, com as linhas apagadas e o botão de proposta desligado, para quem quer montar a lista de alvos antes de a janela abrir. Se não houver ninguém sem clube, aparece só o aviso e o botão.

**Código**: `MarketScreen.tsx` (`BuyTab`), usando `currentOrNextWindow` como o `TransferWindowNote` já faz.

## 7. Ver elenco e formação dos outros times

**Hoje**: os nomes nas tabelas de Competições não são clicáveis.

**Proposta**: tocar no nome de um clube (na classificação, nos jogos e no chaveamento da copa) abre uma **ficha do clube** em gaveta lateral, como a carta do jogador:

- Escudo, cidade, divisão, posição e campanha.
- A formação e a escalação que a IA usaria hoje, desenhadas no campo (o mesmo `Pitch` da página Time, só para ver).
- O elenco em lista, ordenado por posição, com geral; tocar num jogador abre a carta dele, de onde já dá para fazer proposta.
- Os últimos cinco resultados.

O mesmo link vale para o adversário no cartão "Próximo jogo" do Resumo, o que ajuda a se preparar para a partida.

**Código**: `clubLineup(game, clubId)` em `season.ts` já devolve a escalação da IA. Um `ClubSheet.tsx` novo, e o `ClubName` ganha um `onClick` opcional.

## 8. Simular até uma data

**Hoje**: dá para avançar até o próximo jogo, simular o jogo ou simular a temporada inteira.

**Proposta**: no Calendário, tocar num dia futuro mostra "Simular até 12 de julho". O jogo confirma ("Seus 4 jogos até lá vão ser simulados sem você assistir") e joga todos os dias até a data escolhida, parando antes do jogo daquele dia, se houver. Para no meio do caminho quando chega uma proposta por um jogador seu, como o "Avançar" já faz, e avisa onde parou.

**Código**: uma ação nova `{ until: GameDate }` no worker (`season.worker.ts`), com uma função `simulateUntil(game, date)` em `season.ts` que repete `playMatchDay` enquanto o próximo dia de jogo for antes da data e termina com `passDays` até ela. Teste: simular até uma data cai exatamente nela, com todos os jogos anteriores jogados. Na tela, `MonthGrid` e `MonthList` ganham a seleção do dia.

## 9. Finanças numa aba própria

**Hoje**: a aba "Visão do clube" junta Diretoria, Finanças, Patrocínio e Estádio numa página só.

**Proposta**: Finanças vira uma aba, ficando **Visão do clube, Finanças, Histórico, Editor**. A Visão do clube fica com Diretoria, Patrocínio e Estádio. O endereço `/jogo/clube/financas`, que hoje rola até a seção, passa a abrir a aba, então os links antigos continuam funcionando.

Alternativa: levar Patrocínio e Estádio junto, já que os três tratam de dinheiro. Fica uma aba Finanças mais completa e a Visão do clube só com a Diretoria. Escolho a primeira por ser o que foi pedido.

**Código**: `ClubScreen.tsx` (tirar `financas` de `SECTIONS` e pôr em `TABS`).

## 10. Tema

**Hoje**: o botão alterna claro, escuro e sistema, e o padrão é sistema.

**Proposta**: o botão alterna só **claro e escuro**, e o padrão passa a ser **escuro**. Quem tinha "sistema" salvo vai para escuro.

**Código**: `store/theme.ts` (tipo, padrão e a versão do `persist` com `migrate`), `ThemeToggle.tsx`, `components/ui/sonner.tsx` e o script de `index.html` que aplica o tema antes da primeira pintura (passa a ligar o escuro sempre que o salvo não for "claro"). A `theme-color` do `index.html` pode acompanhar o fundo escuro.

## 11. Prints na página Aprenda

**Hoje**: as 13 seções da aba Carreira e as 7 da Fantasia são só texto (`src/ui/learn.ts`).

**Proposta**: cada seção ganha **um print da tela de que ela fala**, com o texto encurtado para o essencial, já que a imagem mostra onde fica cada coisa. Detalhes:

- Prints recortados na parte que interessa (o cartão de treino, a lista do mercado), não a tela inteira.
- Uma versão para celular e outra para computador, escolhida pela largura da tela (`<picture>`), em tema escuro, que passa a ser o padrão.
- Formato WebP, carregados só ao rolar até eles (`loading="lazy"`), para não pesar a primeira abertura.
- Toque no print abre ele ampliado.

**Como os prints são feitos**: um script `npm run learn:shots` com Playwright abre uma carreira de semente fixa no pacote Brasileirão, navega até cada tela e salva os recortes em `public/aprenda/`. Assim, quando uma tela mudar, basta rodar o script de novo e todos os prints se atualizam. Cada seção em `learn.ts` ganha um campo `shot` com o nome do arquivo, e um teste confere que todo `shot` citado existe em `public/aprenda/`.

**Por que por último**: os itens 3, 5, 6, 8 e 9 mudam telas que vão aparecer nos prints. Fazendo o 11 no fim, os prints já saem certos. O texto da Aprenda também ganha as novidades (funções, setas do treino, simular até uma data).

---

## Decisões

Fechadas em 16/10/2026:

- **Item 3**: funções sobre as cinco posições atuais, sem trocar a posição dos jogadores. É o caminho que não exige reeditar o pacote Brasileirão.
- **Item 5**: coluna na lista do elenco mais filtro "Podem treinar" (ideias A + B).
- **Item 9**: só Finanças vai para a aba nova; Patrocínio e Estádio ficam na Visão do clube.
