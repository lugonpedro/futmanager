# Melhorias antes das ligas

Continuação de [02-plano-pos-mvp.md](02-plano-pos-mvp.md). As fases 8 a 12 estão prontas (PRs #10 a #15). Antes da fase 13 (ligas com amigos), esta lista junta as mudanças de interface e as features novas pedidas depois da fase 12. A tela de partida tem tantas mudanças que ficou num documento próprio: [04-partida.md](04-partida.md).

## Ordem proposta

| Etapa | O que entrega                                            | Tamanho      | Mexe no save?  |
| ----- | -------------------------------------------------------- | ------------ | -------------- |
| M1    | Notificações (toasts) e confirmação antes de simular     | Pequeno      | Não            |
| M2    | Tela inicial explicando o que fica só no aparelho        | Pequeno      | Não            |
| M3    | Seleção da rodada em lista                               | Pequeno      | Não            |
| M4    | Time: mais formações e elenco mais largo                 | Médio        | Não            |
| M5    | Clube: Diretoria, Finanças e Estádio numa página só      | Pequeno      | Não            |
| M6    | Partida (ver [04-partida.md](04-partida.md))             | Grande       | Não            |
| M7    | Patrocínios com contratos                                | Médio        | Sim (versão 7) |
| M8    | Evolução dos jogadores: treino e chance real para a base | Médio/grande | Sim (versão 7) |
| M9    | Pacote de teste com o Brasileirão 2026                   | Médio        | Talvez         |

Por que essa ordem:

- **M1 primeiro** porque as outras etapas usam o mesmo componente de notificação e de confirmação.
- **M2 a M5 são só interface**: dá para fazer um PR por etapa, ou juntar as pequenas.
- **M7 e M8 mudam o `GameState`**. Se forem no mesmo PR, sobem o save uma vez só, para a versão 7. Se forem separados, a segunda sobe para a 8.
- **M9 por último**, depois de todas as outras, como decidido no plano pós-MVP.
- Tudo isso vem antes da fase 13 porque a liga reaproveita as mesmas telas: o que melhorar aqui já nasce melhor no online.

---

## M1: Notificações e confirmações

### Componente

O shadcn/ui tem o `Sonner` (toasts) pronto para o projeto. Um toast aparece no canto, some sozinho em alguns segundos e pode ter um botão ("Ver propostas"). A confirmação usa o `AlertDialog` do shadcn, no lugar do `window.confirm` que o jogo usa hoje para apagar carreira.

### Proposta recebida ao avançar

O motor **já para** no dia em que um clube faz proposta por um jogador do usuário (`advanceToNextGame` com `stopOnOffers`). O que falta é avisar: hoje o calendário só para e o aviso fica no quadro "Propostas" mais abaixo na Visão geral.

- Ao parar por proposta, mostrar um toast: "O Atlético Rio do Leste ofereceu R$ 2,4 mi por Fulano", com o botão "Ver proposta" que abre o Mercado na aba de propostas.
- As propostas da IA chegam em dois momentos: nos sábados de mercado sem rodada e logo depois de cada rodada. O avanço só para nas de sábado. Com o toast, as que chegam depois da rodada também passam a ser avisadas.
- O toast diz se o jogador estava à venda ou se a proposta veio sem ele estar listado.

### Confirmação antes de simular

"Simular jogo" e "Simular até o fim da temporada" pedem confirmação num modal:

- **Simular jogo**: "O jogo contra X vai ser simulado sem você assistir. Continuar?"
- **Simular até o fim**: "Todas as rodadas que faltam (N) vão ser simuladas com a sua escalação, trocando quem se lesionar ou for suspenso. Propostas que chegarem no caminho vão expirar. Continuar?"
- Uma caixa "Não perguntar de novo" guarda a escolha no navegador.

### Onde mais notificar

Levantamento das ações que hoje acontecem sem retorno visível, ou com o retorno escondido em outra tela:

| Onde                  | Quando                                                           | Notificação                                           |
| --------------------- | ---------------------------------------------------------------- | ----------------------------------------------------- |
| Visão geral (avançar) | Proposta por jogador                                             | Toast com "Ver proposta" (acima)                      |
| Visão geral (avançar) | Proposta de outro clube para o técnico                           | Toast com "Ver propostas de emprego"                  |
| Visão geral (avançar) | Jogador lesionado ou suspenso para o próximo jogo                | Toast "Fulano está fora por 2 rodadas" com "Ver time" |
| Visão geral (avançar) | Janela de transferências abriu ou fechou                         | Toast informativo                                     |
| Visão geral (avançar) | Dia de pagamento deixou o caixa negativo                         | Toast de alerta com "Ver finanças"                    |
| Visão geral (avançar) | Proposta do usuário aceita ou recusada pela IA                   | Toast com o resultado                                 |
| Mercado               | Proposta enviada, contratação feita, jogador vendido ou listado  | Toast de confirmação                                  |
| Mercado               | Proposta da IA perto de expirar (último dia)                     | Toast ao abrir o jogo                                 |
| Time                  | Escalação salva com jogador fora de posição ou indisponível      | Toast de alerta                                       |
| Time                  | Contrato renovado ou jogador dispensado                          | Toast de confirmação                                  |
| Clube                 | Preço do ingresso alterado, obra no estádio, patrocínio assinado | Toast de confirmação                                  |
| Diretoria             | Confiança caiu para a faixa de risco                             | Toast de alerta depois do jogo                        |
| Fim de temporada      | Título, acesso, rebaixamento, copa                               | Toast de comemoração (ou de lamento)                  |
| Conta (menu inicial)  | Sincronização terminou, falhou ou houve conflito                 | Toast discreto                                        |
| Editor                | Pacote importado ou exportado                                    | Toast no lugar da mensagem de texto atual             |

Regra para não virar spam: no máximo três toasts de uma vez. Se o avanço gerar mais, eles viram um só ("4 novidades") com o link para a Visão geral.

---

## M2: Tela inicial e conta

Hoje o menu tem o botão "Jogar em vários aparelhos", mas quem não abre a página não fica sabendo que as carreiras estão só naquele navegador.

- Sem conta: uma faixa no topo da lista de carreiras: "Suas carreiras estão salvas só neste navegador. Para continuar em outro aparelho, entre na sua conta." com o botão "Entrar".
- Com conta: a faixa vira uma linha discreta: "1 carreira na nuvem" e as outras ficam marcadas "só neste aparelho", como já está.
- O menu inicial ainda está confuso, como você comentou na fase 11. Esta etapa pode reorganizar os botões (Continuar no destaque, Novo jogo, Editor, Conta), sem mexer no resto.

---

## M3: Seleção da rodada em lista

Hoje a Visão geral mostra as cartas especiais dos onze melhores da rodada.

- Passa a ser uma lista: posição, nome, clube e nota da rodada.
- Clicar no nome abre a carta do jogador e a ficha (`PlayerSheet`), com o que o levou à seleção: nota, gols, assistências e defesas.
- Um ponto para você decidir: a carta especial **não** muda atributos hoje, só a cor. Os atributos só mudam uma vez por ano, na virada da temporada. Então ainda não há "atributos que melhoraram" para mostrar. Se a M8 fizer a evolução acontecer ao longo da temporada (ver abaixo), a ficha passa a mostrar o que subiu no último mês, com setinhas verdes.

---

## M4: Time

### Mais formações

As posições hoje são G, Z, L, M e A. Uma formação é só quantos jogadores de cada posição entram. Com isso dá para acrescentar, sem mudar o motor:

| Formação | G   | Z   | L   | M   | A   |
| -------- | --- | --- | --- | --- | --- |
| 3-4-3    | 1   | 3   | 0   | 4   | 3   |
| 4-2-4    | 1   | 2   | 2   | 2   | 4   |
| 5-4-1    | 1   | 3   | 2   | 4   | 1   |
| 4-1-4-1  | 1   | 2   | 2   | 5   | 1   |
| 4-2-3-1  | 1   | 2   | 2   | 5   | 1   |

O 4-1-4-1 e o 4-2-3-1 têm a mesma contagem do 4-5-1. Para eles serem diferentes de verdade, a formação passa a ter também **linhas** (volantes, meias e pontas em alturas diferentes). Isso muda o desenho no campo 2D e pode dar um pequeno peso diferente a defesa e ataque no motor. Dividir as posições (VOL, MC, MEI, PE, PD, CA) seria o caminho completo, mas é a mudança grande que o plano pós-MVP deixou de fora. Decidido: entram as linhas.

### Elenco mais largo

Hoje a página tem duas colunas: à esquerda formação, postura e o campinho com os titulares; à direita a lista do elenco. A proposta:

- No topo, numa faixa só: formação, postura e os titulares como **quadradinhos com a posição e o nome**, organizados por linha, sem o desenho do campo.
- Embaixo, a lista do elenco com a largura toda, com espaço para mais colunas (nota média, forma, condição, contrato, valor).
- O campinho continua disponível num botão "Ver no campo", para quem gosta de arrastar.

---

## M5: Clube numa página só

Hoje Clube tem as abas Diretoria, Finanças, Estádio, Histórico e Editor. A proposta junta as três primeiras numa página "Visão do clube":

- **Topo**: confiança da diretoria e objetivos da temporada.
- **Meio**: caixa, receitas e despesas do mês, com o gráfico do ano.
- **Fim**: estádio, capacidade, ingresso e público médio.
- Histórico e Editor continuam como abas.
- Os endereços antigos (`/jogo/clube/financas`, `/jogo/clube/estadio`) passam a abrir a página nova na seção certa.

---

## M7: Patrocínios

### Hoje

O patrocínio é um valor fixo por mês, calculado pela reputação e pela divisão (`monthlySponsorship` em `src/engine/finance/economy.ts`). Não há contrato, escolha nem meta.

### Proposta

- **Contratos com empresas fictícias**: "Banco Horizonte", "Laticínios Serra Azul". Mesmo com os clubes reais do plano pós-MVP, nada de marcas reais de patrocinadores.
- Primeiro só o **master** (camisa). Depois podem entrar **material esportivo** e **naming rights do estádio** (este só para clubes da Série A com estádio grande), com as mesmas regras.
- No começo de cada temporada chegam 2 ou 3 propostas de master. Cada uma tem:
  - valor fixo por mês;
  - bônus por meta (título, acesso, ficar no G-4, chegar à final da copa);
  - duração de 1 a 3 temporadas.
- Uma proposta "segura" paga mais fixo; uma "ousada" paga menos fixo e mais bônus.
- A reputação, a posição na tabela e a torcida do clube decidem o valor das propostas. Ser campeão rende propostas melhores na renovação.
- Quebrar a meta não gera multa, só a perda do bônus. Rebaixamento pode encerrar o contrato.
- Na página do Clube entra a seção **Patrocínios**, com os contratos atuais e as propostas abertas.

### Save

O `GameState` passa a guardar os contratos do usuário e as propostas abertas: `SAVE_VERSION` sobe para 7. Os saves antigos ganham um contrato master equivalente ao valor fixo de hoje, até o fim da temporada.

---

## M8: Evolução dos jogadores

### Hoje

Os jogadores só mudam uma vez por ano, na virada da temporada (`developPlayer` em `src/engine/progression/progression.ts`). Quanto mais jogaram (até 25 jogos), mais crescem rumo ao potencial. Um garoto da base com 17 anos, 25 de overall e 60 de potencial:

- **sem jogar**: sobe uns 4 pontos por ano e chega aos 21 anos com cerca de 40;
- **jogando a temporada toda**: sobe uns 14 por ano e passa dos 50 aos 20 anos.

Na prática, o garoto da base nunca joga porque é fraco demais para ser escalado, e por isso não cresce. Não existe treino.

### Proposta

1. **Evolução mensal**: o crescimento passa a acontecer no dia 1 de cada mês, um pedaço de cada vez, em vez de um salto em janeiro. A ficha do jogador mostra o que subiu no mês, o que também atende a M3.
2. **Treino**: uma tela simples na página Time com o foco da semana para o elenco (físico, técnico, tático ou descanso) e um **foco individual** para até 5 jogadores (por exemplo "finalização" ou "goleiro: reflexos"). O foco aumenta o crescimento dos atributos escolhidos e o descanso recupera a condição mais rápido. Treino pesado demais aumenta a chance de lesão.
3. **Minutos para a base**: jogos da copa contra times mais fracos e o fim de temporada sem objetivo contam mais para quem tem menos de 21 anos. Também entra o **empréstimo**: emprestar o garoto para um clube da Série B, onde ele joga e cresce, e volta no fim da temporada.
4. **Potencial visível com incerteza**: em vez de "potencial 60", a ficha mostra uma faixa ("55 a 65") que fica mais precisa conforme o jogador joga. Isso dá graça a apostar em jovens.

Com treino, minutos e empréstimo, um 25/60 bem cuidado chega perto de 60 aos 21 ou 22 anos. Sem cuidado, fica nos 40 e poucos, como hoje.

### Save

Foco de treino, empréstimos e o histórico mensal entram no `GameState`: `SAVE_VERSION` sobe (para 7, se for junto com a M7). Os saves antigos começam com foco equilibrado e sem empréstimos.

### Balanceamento

A evolução mensal muda o ritmo do mundo inteiro, inclusive dos clubes da IA. `npm run balance` precisa mostrar as mesmas médias de overall por divisão antes e depois.

---

## M9: Pacote com o Brasileirão 2026

Último passo das melhorias, para testar os nomes reais decididos no [plano pós-MVP](02-plano-pos-mvp.md#decisões).

- Um pacote de dados com os clubes das Séries A e B de 2026 (nome, sigla, cidade e cores) e os jogadores de cada elenco (nome, idade e posição). Atributos e overall continuam gerados pelo jogo, a partir de uma força por clube.
- O pacote fica separado do motor, num arquivo próprio, para dar para atualizar, corrigir ou tirar um nome sem mexer no resto.
- No "Novo jogo" o jogador escolhe entre o mundo gerado e o Brasileirão 2026.
- Sem escudos, fotos nem uniformes oficiais. O Aviso legal ganha o canal de remoção.
- Se o save precisar guardar de qual pacote veio a carreira, `SAVE_VERSION` sobe mais uma vez.

---

## Decisões

Confirmadas em outubro de 2026:

1. **Formações**: as novas contagens (3-4-3, 4-2-4, 5-4-1) e também as com linhas (4-2-3-1, 4-1-4-1).
2. **Simular até o fim**: as propostas expiram no caminho, sem parar a simulação.
3. **Patrocínio**: começar só com o master. Os outros espaços ficam para depois.
4. **Treino**: foco do elenco mais foco individual.
