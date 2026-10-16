# Plano pós-MVP

Continuação de [01-plano-mvp.md](01-plano-mvp.md). O MVP está completo (fases 0 a 7, PRs #1 a #9): carreira offline de várias temporadas, partida narrada, mercado, finanças, diretoria, copa, saves no IndexedDB e PWA.

Este plano junta as ideias de "depois do MVP" que já estavam nos documentos 00 e 01 com os ajustes pedidos agora:

1. Ligas com amigos e login
2. Times brasileiros de verdade (Flamengo, Vasco...) com os nomes dos jogadores
3. Artilharia dentro da página da liga, sem item próprio no menu, e os outros menus que se repetem unidos
4. Calendário com dia/mês/ano, mostrando os meses a partir da data atual do jogo
5. Cartas de jogadores mais ricas, no estilo do EA FC 26/27
6. Elenco e Escalação na mesma página
7. Partida com os jogadores como pontinhos se mexendo num campo 2D

## Ordem proposta

| Fase | O que entrega                                                                        | Tamanho      | Mexe no save?            |
| ---- | ------------------------------------------------------------------------------------ | ------------ | ------------------------ |
| 8    | Menus enxutos: de 10 para 6 itens (Time, Competições, Clube...)                      | Médio        | Não                      |
| 8.5  | Partida no campo 2D, com os pontinhos se mexendo                                     | Médio/grande | Não                      |
| 9    | Calendário com datas                                                                 | Médio        | Sim (versão 4)           |
| 10   | Atributos e cartas estilo FC                                                         | Grande       | Sim (versão 5)           |
| 11   | Editor e pacotes de dados (times reais por conta do usuário) + página de aviso legal | Médio        | Sim (versão 6)           |
| 12   | Contas e save na nuvem                                                               | Médio        | Não                      |
| 13   | Ligas com amigos                                                                     | Grande       | Novo formato no servidor |
| 14+  | Pagamento, mais países e continental, Steam e lojas                                  | —            | —                        |

Por que essa ordem:

- **Interface primeiro** porque melhora o jogo de hoje sem mexer no save, e a página Time já nasce pronta para receber as cartas novas. O campo 2D vem logo depois porque só acrescenta informação à simulação, sem mudar resultados.
- **Calendário e cartas antes do online**: os dois mudam o formato do `GameState`. Mudar o formato com saves só locais é uma migração em `src/engine/save.ts`; mudar depois que existirem ligas no servidor é bem mais caro.
- **Editor depois das cartas**, para o formato dos pacotes de dados já nascer com os atributos definitivos.
- **Login antes das ligas**, porque a liga depende de conta.

---

## Fase 8: Menus mais enxutos

### O que se repete hoje

O menu do jogo tem 10 itens (`src/ui/screens/game/GameLayout.tsx`). Revisando tela por tela, estes são os que mostram a mesma coisa ou dividem o mesmo assunto:

| Hoje                                                                   | O problema                                                                                 | Proposta                                                                                            |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------- |
| **Elenco** e **Escalação**                                             | As duas listam o elenco inteiro; uma ordena, a outra escala                                | Juntar em **Time**                                                                                  |
| Aba "Vender e renovar" do **Mercado**                                  | É o elenco de novo, numa terceira tabela                                                   | Vender e renovar viram ações do jogador dentro de **Time**; o Mercado fica só com o que vem de fora |
| **Tabela**, **Artilharia** e **Copa**                                  | Três páginas para "como estão as competições"; a artilharia só faz sentido junto da tabela | Juntar em **Competições**                                                                           |
| Lado direito do **Calendário** (jogos de todas as divisões por rodada) | É conteúdo de competição, não da sua agenda                                                | Vai para a aba Jogos de **Competições**                                                             |
| **Finanças** e **Carreira**                                            | As duas são "a situação do clube e da diretoria": dinheiro, meta, confiança, histórico     | Juntar em **Clube**                                                                                 |

Com isso o menu passa de 10 para 6 itens:

| Menu novo       | O que tem dentro                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------------- |
| **Resumo**      | Próximo jogo e botão de avançar, avisos, resultados da última rodada, sua posição, top 3 artilheiros da sua divisão |
| **Time**        | Escalação no campo, elenco completo, carta do jogador, vender e renovar                                             |
| **Mercado**     | Contratar, Propostas recebidas, Movimentações                                                                       |
| **Competições** | Série A, Série B e Copa num seletor; abas Classificação (ou Chave, na copa), Artilharia e Jogos                     |
| **Calendário**  | Só os seus jogos, por mês (fase 9)                                                                                  |
| **Clube**       | Diretoria (meta, confiança, propostas de emprego), Finanças, Estádio e ingressos, Histórico                         |

No celular, 6 itens também cabem numa barra fixa embaixo da tela, que é mais rápida que o menu sanfona. Fica como opção para testar.

### Time (Elenco + Escalação + parte do Mercado)

Uma página só, pensada como no FC/FM: o campo e a lista lado a lado.

**Computador (duas colunas)**

- Esquerda: o campo (`Pitch.tsx`) com os 11 titulares como mini-cartas (overall, posição, nome curto, indicador de cansaço/lesão). Em cima, formação, postura e "Escalar automaticamente".
- Direita: o elenco inteiro em uma tabela agrupada em **Titulares**, **Reservas** e **Fora do jogo** (lesionados, suspensos, não relacionados), com as colunas que hoje estão em Elenco (idade, posição, overall, potencial, salário, contrato, status) e ordenação/filtros.

**Celular**

- Campo compacto no topo e a lista embaixo, ou duas abas "Campo" e "Lista" se não couber.

**Interação**

- Arrastar um jogador da lista para uma posição do campo, ou entre posições (biblioteca `@dnd-kit`, que funciona com toque).
- Alternativa sem arrastar, que é a mais confortável no celular: tocar no jogador e depois tocar no lugar onde ele entra. Os dois jeitos chamam a mesma função.
- Jogador escalado fora de posição mostra o encaixe (a regra `positionFit` já existe) com cor: verde, amarelo, vermelho.
- Tocar no nome abre a carta do jogador numa gaveta lateral (a fase 10 deixa essa carta completa; até lá ela mostra o que já existe).
- Colocar à venda, tirar da venda e renovar contrato ficam no menu "⋯" de cada linha e dentro da carta.

### Competições (Tabela + Artilharia + Copa)

- Seletor no topo: Série A, Série B, Copa. Começa na sua divisão.
- Liga: abas **Classificação** (`TableScreen`), **Artilharia** (`ScorersScreen`, filtrada pela divisão) e **Jogos** (todas as partidas de cada rodada).
- Copa: abas **Chave** (`CupScreen`), **Artilharia da copa** e **Jogos**.
- A competição e a aba ficam na URL (`/jogo/competicoes/serie-a/artilharia`), para o link funcionar e o botão voltar do celular se comportar bem.

### Clube (Finanças + Carreira)

- Abas **Diretoria** (meta da temporada, confiança, propostas de emprego), **Finanças** (temporada, lançamentos, temporadas anteriores), **Estádio** (preço do ingresso e, no futuro, ampliação) e **Histórico** (temporadas da carreira).
- Quando a confiança está baixa ou chega proposta de emprego, o aviso continua aparecendo no Resumo, com link para a aba.

### Endereços antigos

`/jogo/elenco`, `/jogo/escalacao`, `/jogo/tabela`, `/jogo/artilharia`, `/jogo/copa`, `/jogo/financas` e `/jogo/carreira` redirecionam para a página nova, para não quebrar favoritos nem o PWA instalado.

**Critério de pronto**: menu com 6 itens; dá para montar a escalação, vender e renovar sem sair de Time, no computador e no celular; nenhuma informação que existia hoje se perdeu.

---

## Fase 8.5: Partida no campo 2D

Era uma das ideias do começo (documento 00): ver a partida com os jogadores como pontinhos se mexendo num campo, além da narração.

### Como funciona

O motor continua decidindo tudo, como hoje: o resultado não depende da animação. O campo é uma **camada visual** que encena o que o motor já decidiu, então não precisa de física nem de engine de jogo.

- **Motor**: a simulação minuto a minuto (`src/engine/match/simulate.ts`) já sabe, a cada minuto, quem tem a posse e se houve chance, defesa, gol, cartão ou lesão. Ela passa a registrar também um **lance** por minuto: o time com a bola, por qual lado ele avança (esquerda, centro, direita), até que faixa do campo chega (defesa, meio, ataque) e como termina (perde a bola, chuta para fora, goleiro defende, gol, falta). Tudo sai do mesmo gerador com semente, então a partida continua reproduzível.
- **Animação**: a interface transforma cada lance em uns 2 a 4 segundos de movimento:
  - 22 pontinhos com as cores dos clubes e o número da camisa, posicionados pela formação de cada time.
  - O bloco do time sobe e desce acompanhando a bola; quem ataca abre, quem defende fecha.
  - A bola passa entre jogadores do time com a posse, na direção que o lance indica, e termina no chute, no desarme ou no gol.
  - Gol: a bola entra, o placar pisca e o nome do autor aparece. Cartão e lesão aparecem como um ícone em cima do pontinho.
  - Substituição troca o número; expulso sai do campo e o time joga com 10.
- **Desenho**: `<canvas>` 2D com `requestAnimationFrame`, sem biblioteca. Campo deitado no computador e em pé no celular.

### Na tela de partida

- Campo em cima (ou à esquerda), narração ao lado ou embaixo, como hoje (`MatchFeed`).
- As velocidades que já existem (`MatchControls`) controlam o ritmo da animação; "pular para o fim" continua funcionando.
- Botão **"Só texto"** para quem prefere o modo Brasfoot clássico ou está num celular fraco. A escolha fica salva.
- O Amistoso usa o mesmo campo.
- Depois: **"Ver lance"** nos gols, para rever o lance de qualquer jogo já jogado. Isso também vai servir para o replay das ligas com amigos (fase 13).

### Save

Não muda o formato do save. Os lances só existem durante a partida ao vivo; para o "Ver lance", o jogo pode re-simular a partida a partir da semente.

**Critério de pronto**: o lance desenhado bate com a narração (o gol aparece no campo no mesmo minuto em que aparece no texto), os testes de balanceamento continuam passando e a animação roda lisa num celular intermediário.

---

## Fase 9: Calendário com datas

Hoje a temporada só conhece "rodada 1 a 38" e a copa joga "depois da rodada 5, 11, 17..." (`CUP_ROUNDS` em `src/engine/season/cup.ts`). A proposta é o jogo ter uma **data atual** e cada jogo ter **dia, mês e ano**.

### Modelo

- `GameState.today`: a data atual do jogo, em texto `AAAA-MM-DD` (fácil de salvar em JSON e de comparar).
- `Fixture.date`: a data de cada jogo, também `AAAA-MM-DD`.
- As datas são calculadas pelo motor a partir do ano da temporada, sem `Date.now` e sem fuso horário (funções próprias de data em UTC ou contagem de dias), para continuar determinístico.

### Calendário da temporada (parecido com o futebol brasileiro)

- Pré-temporada e janela de transferências em janeiro.
- Liga do fim de semana: começa num sábado de abril e vai até o começo de dezembro, uma rodada por fim de semana, com algumas rodadas no meio da semana para caber as 38.
- Copa às quartas-feiras, nas semanas que hoje correspondem a `CUP_ROUNDS`.
- Pausa em uma ou duas datas (o espaço para "data FIFA" e, no futuro, seleções e continental).
- Uma janela de transferências no meio do ano (julho), que o Mercado passa a respeitar. Fora da janela só dá para contratar jogador sem clube.

### Avançar no tempo

- O botão principal deixa de ser "jogar rodada" e passa a ser **"Avançar até o próximo jogo"**, mostrando a data: "Próximo jogo: sáb, 18/04/2027, contra X".
- Eventos que hoje acontecem "por rodada" (salários, propostas, lesões) passam a ter data: salário no dia 1º de cada mês, propostas expiram em 7 dias, lesão dura N dias.
- Entre temporadas, os dias de dezembro e janeiro passam com a pré-temporada (base, aposentadorias, renovação) em vez de pular direto.

### Página do Calendário

- Visão **mensal**, começando no mês da data atual do jogo e seguindo para os próximos (com setas para voltar aos meses passados).
- Cada dia com jogo mostra o adversário, C/F (casa/fora), a competição (Liga ou Copa) e, se já foi jogado, o placar com V/E/D em cor.
- O dia de hoje destacado; janelas de transferências como uma faixa colorida.
- No celular, a grade vira uma lista agrupada por mês ("Abril 2027", "Maio 2027"...), também começando no mês atual.
- A lista de jogos de todas as divisões por rodada sai daqui e vai para a aba Jogos de Competições (fase 8).

### Save

`SAVE_VERSION` sobe para 4. A migração calcula as datas dos jogos da temporada em curso a partir das rodadas e põe `today` na data da próxima rodada.

---

## Fase 10: Atributos e cartas estilo FC

Hoje o jogador tem uma `strength` (1 a 99), um `potential` e de 0 a 2 `traits`. Isso é o modelo Brasfoot. A proposta é chegar perto do EA FC sem virar Football Manager.

### Atributos

Seis atributos de "face", cada um vindo de 2 a 4 sub-atributos (1 a 99). Nomes e siglas em português:

| Face (linha)        | Sub-atributos                                                 |
| ------------------- | ------------------------------------------------------------- |
| **RIT** Ritmo       | Aceleração, Velocidade                                        |
| **FIN** Finalização | Finalização, Força do chute, Posicionamento ofensivo, Pênalti |
| **PAS** Passe       | Passe curto, Passe longo, Visão, Cruzamento                   |
| **DRI** Drible      | Drible, Controle de bola, Agilidade                           |
| **DEF** Defesa      | Marcação, Desarme, Interceptação, Cabeceio                    |
| **FIS** Físico      | Força, Resistência, Impulsão, Agressividade                   |

Goleiro tem a sua própria face: **ELA** Elasticidade, **MÃO** Manejo, **REP** Reposição, **REF** Reflexo, **VEL** Velocidade, **POS** Posicionamento.

Além dos números:

- **Pé preferido** e **perna ruim** (1 a 5 estrelas).
- **Posições secundárias** (ex.: um meia que também joga de ponta). Isso substitui a regra fixa de "posição vizinha" em `positionFit`.
- **Estilos de jogo**: os `traits` de hoje viram estilos com nome, como os PlayStyles do FC (ex.: Finalizador, Cabeceador, Armador, Muralha, Velocista, Paredão no gol). Os melhores jogadores têm a versão "+", que pesa mais.
- **Forma** (últimos 5 jogos, de -2 a +2) e **condição física** que passa de um jogo para o outro, em vez de todo mundo começar a partida com energia cheia.
- Mais posições, se couber: dividir M em VOL/MC/MEI e A em PE/PD/CA. Recomendo deixar para depois e ficar com G/Z/L/M/A mais as posições secundárias, porque as formações e a escalação automática dependem dessas cinco.

### Overall

O **overall** é calculado pelos atributos com pesos por posição (zagueiro pesa DEF e FIS; atacante pesa FIN, RIT e DRI). Ele substitui `strength` no lugar onde ela aparece. Salário e valor de mercado continuam calculados a partir do overall (`wageFor`, `marketValueFor`).

### Partida

O motor deixa de usar só a força média por setor:

- Chance criada: PAS e DRI do meio e do ataque contra DEF do adversário.
- Finalização e gol: FIN de quem chuta contra o goleiro (REF, ELA, POS).
- Bola aérea e escanteio: Cabeceio e Impulsão; o estilo Cabeceador aumenta a chance.
- Cansaço: Resistência define quanto a energia cai por minuto.
- Velocistas rendem mais contra defesa lenta no contra-ataque.

Os testes de balanceamento que já existem (`src/engine/balance.test.ts` e `npm run balance`) continuam valendo: média de ~2,5 gols por jogo, ~45% de vitória do mandante, time mais forte vence mais. Precisam passar antes de a fase acabar.

### Evolução

A evolução por idade e minutos (`src/engine/progression`) passa a mexer nos sub-atributos de forma diferente por idade: jovens ganham mais em técnica, físico cai primeiro depois dos 30, e Visão/Posicionamento ainda sobem até ~32.

### Visual da carta

- Formato de carta vertical com overall e posição no canto, nome, 6 atributos de face em duas colunas, pé preferido, perna ruim e estilos.
- Cor da carta pela faixa de overall (bronze, prata, ouro), com os cortes calibrados pela distribuição do nosso jogo, não pelos números do FC.
- Cartas especiais como recompensa: **Seleção da rodada** (os melhores de cada rodada ganham uma carta diferente naquela semana) e **Craque da temporada**.
- Escudo do clube na carta: um escudo genérico desenhado a partir das cores e da sigla, nunca o escudo de verdade.
- Gaveta de detalhes: todos os sub-atributos com barras, histórico por temporada (jogos, gols, nota média), contrato e valor.
- O desenho é nosso, inspirado no formato do FC. Não usar o nome "FC", "Ultimate Team", o layout idêntico ou artes da EA.

### Save

`SAVE_VERSION` sobe para 5. A migração gera os sub-atributos de cada jogador existente a partir da `strength`, da posição e dos `traits`, usando uma semente por jogador (`mixSeed(seed, playerId)`), de modo que o overall novo fique igual ou muito perto da força antiga. Assim as carreiras em andamento continuam equilibradas.

---

## Fase 11: Times brasileiros reais (editor e pacotes de dados)

### O que você pediu

Ter Flamengo, Vasco e os outros com os nomes dos jogadores de verdade, só os nomes, com um aviso em alguma página do site.

### Avaliação de risco (isto não é parecer jurídico)

Pelo que pesquisei, o risco é real e o aviso sozinho não resolve:

- **Nome e símbolos dos clubes**: a legislação esportiva brasileira (a Lei Pelé, art. 87, e a Lei Geral do Esporte, Lei 14.597/2023, que substituiu boa parte dela) diz que o nome e os símbolos de um clube são propriedade exclusiva dele, com proteção mesmo sem registro. Além disso, os grandes clubes têm marcas registradas no INPI. Usar o nome num produto comercial sem licença pode ser violação de marca. É preciso confirmar com um advogado qual dispositivo está vigente hoje.
- **Nome dos jogadores**: o Código Civil (arts. 18 e 20) protege o nome e a imagem da pessoa contra uso comercial sem autorização, e a mesma lei esportiva protege o "nome ou apelido desportivo" do atleta. Atletas brasileiros já processaram EA e Konami por uso de nome em jogos sem licença, e houve condenações. A EA paga licenças para isso.
- **Disclaimer** ("jogo não oficial, sem vínculo com os clubes") ajuda a mostrar que não há afiliação e que ninguém deve confundir, mas **não autoriza** o uso. Ele reduz um tipo de risco (confusão de marca), não os outros.
- O risco cresce muito quando há **dinheiro** (versão paga, anúncios) e quando **nós hospedamos** o conteúdo.

### Opções

| Opção                            | Como funciona                                                                                                               | Risco                                                               |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| A. Nomes reais embutidos no jogo | Nós incluímos Flamengo, Vasco e os jogadores no jogo                                                                        | **Alto**, principalmente com versão paga                            |
| B. Nomes parecidos               | "Rubro-Negro Carioca", "Cruzmaltino"... e jogadores com nomes trocados                                                      | Médio/baixo; apelidos populares também podem ser marcas registradas |
| C. Editor + pacote do usuário    | O jogo vem com times fictícios. O jogador cria ou importa um arquivo com os nomes que quiser, que fica só no navegador dele | **O mais baixo**; é o modelo dos patches do Brasfoot                |

### Recomendação: opção C, feita para ser fácil

1. **Editor de times dentro do jogo**: renomear clube (nome, sigla, cidade, cores) e jogadores (nome; opcionalmente idade, posição e overall). Atributos que o usuário não preencher são gerados como hoje.
2. **Pacote de dados**: um arquivo `.json` (e importação de planilha `.csv`, que é como a maioria vai querer montar) com só os nomes, como você pediu. Ao começar um "Novo jogo", o usuário escolhe "Mundo gerado" ou "Importar pacote". O pacote substitui nomes do mundo gerado (clube por clube, jogador por jogador); o que faltar continua gerado.
3. **Exportar pacote**: quem montou o seu pode exportar e mandar para os amigos por fora (WhatsApp, Discord). Nós **não hospedamos** e **não distribuímos** pacotes com nomes reais, pelo menos até falar com um advogado.
4. **Sem escudos**: o pacote não aceita imagem. Escudo é sempre o genérico desenhado com cores e sigla.
5. **Página "Aviso legal"** no rodapé e no menu principal, com um texto como:

   > O futmanager é um jogo independente e não tem nenhuma ligação com clubes, federações, ligas ou atletas. Os times e jogadores que vêm com o jogo são fictícios; qualquer semelhança é coincidência. Nomes inseridos pelos usuários no editor ou em pacotes importados são de responsabilidade de quem os inseriu, ficam apenas no dispositivo do usuário e não são publicados pelo futmanager. Se você representa um clube ou atleta e quer que algo seja removido, escreva para [e-mail de contato].

   Os termos de uso precisam dizer o mesmo.

6. **Antes de cobrar ou de lançar ligas online**: uma consulta com advogado de propriedade intelectual/direito desportivo. Nas ligas online (fase 13) os nomes do pacote do dono da liga ficariam no nosso servidor, mesmo que visíveis só para os membros. Isso é hospedar conteúdo de usuário e precisa de canal de denúncia e remoção. Até ter essa resposta, a liga online usa o mundo gerado.

### Save

`SAVE_VERSION` sobe para 6 se o save passar a guardar a origem dos nomes (pacote importado ou gerado), para o jogo saber o que regenerar.

---

## Fase 12: Contas e save na nuvem

- **Backend**: Supabase (login, banco Postgres, funções no servidor, plano grátis para começar), como já sugerido no documento 00.
- **Login**: e-mail com link mágico e "Entrar com Google". Sem senha para guardar.
- O jogo continua funcionando **sem conta** e offline; a conta é opcional e serve para:
  - **Save na nuvem**: sincronizar os slots do IndexedDB com a conta, para continuar a carreira em outro aparelho. Conflito resolvido pelo mais recente, com confirmação.
  - Entrar em ligas com amigos (fase 13).
  - Mais adiante, o desbloqueio pago (fase 14).
- Perfil simples: apelido e um escudo genérico de técnico.
- LGPD: página de privacidade, botão para apagar a conta e os dados.

---

## Fase 13: Ligas com amigos

### Como funciona para o jogador

- Alguém cria uma liga e manda um **link de convite** (ou código de 6 letras) no grupo.
- Cada amigo escolhe um clube do mesmo mundo; os outros clubes são da IA.
- A liga é **assíncrona** (cada um joga quando pode), que é o que funciona num grupo de amigos:
  - Cada um acerta escalação, tática e mercado para o próximo jogo.
  - A rodada roda quando **todos marcam "pronto"** ou no **horário limite** que o dono escolheu (ex.: todo dia às 21h). Quem não mexeu joga com a escalação automática.
  - Depois todos veem a partida narrada "ao vivo" em replay, os placares e a tabela.
- **Mercado entre amigos**: propostas de compra e troca entre humanos, com aceite dos dois lados.
- **Mural da liga** com resultados automáticos ("Fulano goleou Beltrano 4 a 0") e comentários.
- Aviso por notificação do PWA (e/ou e-mail) quando a rodada for jogada ou o prazo estiver acabando.
- Até 20 humanos por liga (um por clube da Série A), mais a Série B da IA.

### Como funciona por dentro

- O motor já é TypeScript puro e determinístico a partir de uma semente, então o **servidor roda a mesma simulação** (numa função do Supabase, que roda TypeScript). O resultado é calculado só no servidor, para ninguém trapacear editando o navegador.
- O estado da liga fica no banco: o mundo da liga e, por rodada, as escalações enviadas e os resultados. Cada jogador só vê e altera o que é dele (regras de acesso por linha do Postgres).
- O cliente baixa o estado da liga e reaproveita as mesmas telas da carreira solo; a diferença é que "Avançar" vira "Estou pronto".
- O tamanho do `GameState` precisa ser medido antes (um mundo com 40 clubes e ~1000 jogadores, mais históricos); se ficar grande, guardar o mundo uma vez e só as mudanças por rodada.

### Fora da primeira versão

Partida em tempo real com todos assistindo juntos, chat ao vivo, ligas públicas com desconhecidos, ranking global.

---

## Fase 14 em diante (já estava no plano)

- **Pagamento único com Pix** (Mercado Pago ou Stripe), atrelado à conta. O que fica grátis e o que é pago ainda precisa ser decidido; uma ideia é deixar a carreira solo inteira grátis e cobrar pela criação de ligas online ou por slots extras de save na nuvem, que é onde há custo de servidor.
- **Mais países e competições continentais** (uma "Libertadores" fictícia), usando as datas da fase 9.
- **Seleções** e convite para treinar a seleção.
- **Steam (Tauri) e lojas de celular (Capacitor)**.

## Decisões

Confirmadas em outubro de 2026:

1. **Times reais**: nomes reais embutidos no jogo (a opção A da fase 11), como fazem outros jogos brasileiros do gênero (7a0, 38zero). O risco jurídico descrito na fase 11 continua valendo e fica maior com a versão paga. Por isso:
   - os nomes ficam num pacote de dados separado do motor (um arquivo por temporada), para trocar, atualizar ou tirar um clube ou jogador sem mexer no resto;
   - sem escudos, fotos nem uniformes oficiais: escudo continua o genérico, com cores e sigla;
   - a página "Aviso legal" ganha um canal de remoção, e um pedido de clube ou atleta é atendido tirando o nome do pacote;
   - o mundo gerado continua existindo como opção no "Novo jogo";
   - continua valendo conversar com um advogado antes de cobrar por mais espaços na nuvem.
2. **Posições**: manter G/Z/L/M/A com posições secundárias.
3. **Ligas**: assíncronas, com prazo diário.
4. **Começo da temporada**: abril a dezembro, como o Brasileirão.

## Riscos

- **Balanceamento das cartas**: trocar a força única por 20 atributos é a maior mudança no motor desde a fase 2. Os testes de balanceamento e `npm run balance` precisam rodar a cada passo.
- **Migração de saves**: três mudanças de formato seguidas (fases 9, 10 e 11). Cada uma com teste em `src/engine/save.test.ts` abrindo um save da versão anterior.
- **Custo e manutenção do servidor**: a partir da fase 12 o jogo deixa de ser só um site estático. Supabase grátis cobre o começo, mas é preciso monitorar.
- **Jurídico**: nomes reais e conteúdo de usuário hospedado, como descrito na fase 11.
