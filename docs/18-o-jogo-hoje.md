# O jogo hoje

Retrato do onzemestre em 22/10/2026, conferido na `main` (PR #99). Junta o que os planos 00 a 15 entregaram, sem o histórico de cada passo. Os planos antigos continuam no histórico do git e na pasta `pesquisa/` do projeto. O que ainda não existe está em [19-ideias.md](19-ideias.md).

## Visão geral

Jogo de gerenciamento de futebol no navegador, inspirado no Brasfoot, com dois modos:

| Modo                 | Onde roda                                            | Precisa de conta | Precisa de passe     |
| -------------------- | ---------------------------------------------------- | ---------------- | -------------------- |
| **Carreira**         | No aparelho, offline (Web Worker + IndexedDB)        | Não              | Não                  |
| **Draft com amigos** | No servidor (Supabase), com o mesmo motor da partida | Sim              | Só para criar a sala |

O motor (`src/engine`) é TypeScript puro e determinístico a partir de uma semente: a mesma semente gera o mesmo mundo, e cada partida tem a própria semente, então assistir ou simular dá o mesmo placar. É por isso que o servidor das salas e o navegador chegam ao mesmo resultado.

A tela inicial tem: continuar uma carreira, **Nova carreira**, **Draft com amigos** (`/salas`), conta, Aviso legal e Privacidade. O tema é claro ou escuro, escuro por padrão. O jogo é um PWA instalável.

---

## Partida e jogadores (vale nos dois modos)

### A partida

- Simulada minuto a minuto: posse pelo meio-campo, chance pelo ataque contra a defesa, finalização contra o goleiro, bolas aéreas, contra-ataques pela velocidade, cartões, lesões e cansaço.
- Mandante com vantagem. Em média uns 2,5 gols por jogo e o mandante vence uns 45% das vezes (`npm run balance`, `npm run balance:match`).
- **Tela ao vivo** (`/jogo/partida`, e o replay nas salas): campo 2D com os jogadores e a bola (passe, chute, defesa, desarme), times trocando de lado no intervalo, uniformes que não se confundem, narração, estatísticas (posse, finalizações, faltas, cartões) e notas ao vivo dos dois times. Velocidades Normal e Rápido, ou só texto. No celular, Lances, Estatísticas e Notas viram abas.
- Durante o jogo: até 5 substituições, trocar a formação e trocar dois titulares de lugar sem gastar substituição.

### Escalação, funções e posições

- Dez formações: 4-4-2, 4-3-3, 3-5-2, 4-5-1, 5-3-2, 3-4-3, 4-2-4, 5-4-1, 4-1-4-1 e 4-2-3-1. Sete no banco.
- Cinco posições de cadastro (G, Z, L, M, A) mais posições secundárias. Fora da posição o jogador rende 97% (secundária) ou 92%; a cor no campo mostra isso.
- Cada vaga tem uma **função** (volante, meia ofensivo, ponta, centroavante...), que muda o peso do jogador em defesa, meio e ataque e quanto ele chuta. Tocando num titular dá para escolher outra função do setor, como Ala ofensivo, Lateral invertido, Regista, Atacante sombra, Corta pra dentro e Falso 9. As funções de lado também servem numa vaga central. A função fica com a vaga.
- Campo visível por padrão, com "Ver em lista".

### Cartas, atributos e playstyles

- 26 atributos agrupados em seis números de face (Ritmo, Finalização, Passe, Drible, Defesa, Físico; no goleiro, seis próprios), pé preferido, perna ruim e posições secundárias.
- O **geral** pesa os atributos pela posição. A carta é bronze abaixo de 50, prata até 69, ouro a partir de 70, com cartas especiais para a seleção da rodada e o craque da temporada, e o escudo genérico do clube.
- **17 playstyles** saem dos atributos (no máximo 3 por jogador, com versão "+" a partir de média 84). Cada um mexe no lance em que conta. Quem tem geral 65 ou mais tem pelo menos um; de 80 para cima, pelo menos dois. Ninguém perde um playstyle, mas o "+" pode cair com a idade. A ficha mostra o playstyle que está perto de vir.
- Função com um playstyle que combina rende 1,5% a mais por nível.

### Energia, forma, cartões e lesões

- Energia de 0 a 100, que cai no jogo e volta com os dias. Nota de 3 a 10 por jogo; forma das últimas 5 notas.
- Vermelho ou três amarelos suspendem o próximo jogo. Lesões de 8 a 38 dias, as curtas mais comuns.
- Seleção da rodada com os melhores de cada posição.

---

## Carreira

### Mundo e começo

- **Nova carreira** com duas abas: **Mundo gerado** (times e jogadores fictícios, "Gerar outro mundo") e **Usar pacote** (Brasileirão 2026, que vem com o jogo, ou um pacote importado).
- 40 clubes: Série A e Série B com 20 cada. Cada elenco tem de 18 a 32 jogadores, com pelo menos 2 goleiros.
- Saves no IndexedDB, um por carreira, com autosave. O formato está na versão 16 (`SAVE_VERSION`), e os saves antigos migram sozinhos em `src/engine/save.ts`.

### Menu do jogo

| Página          | O que tem                                                                                                    |
| --------------- | ------------------------------------------------------------------------------------------------------------ |
| **Resumo**      | Próximo jogo com a posição dos dois times, avançar, jogar ou simular, avisos, resultados e seleção da rodada |
| **Time**        | Campo e elenco, funções, desfalques, treino, favoritos, vender, renovar e emprestar                          |
| **Mercado**     | Contratar (com filtros e paginação), propostas recebidas e movimentações                                     |
| **Competições** | Série A, Série B e Copa; classificação ou chave, artilharia e jogos. Tocar num clube abre a ficha dele       |
| **Calendário**  | Os seus jogos por mês; tocar num dia simula até ele                                                          |
| **Clube**       | Visão do clube (diretoria, patrocínio, estádio), Finanças, Histórico e Editor                                |

No celular o topo mostra a sigla, a data e o caixa.

### Temporada e competições

- Calendário com datas, de janeiro (pré-temporada) a dezembro. Campeonato de 38 rodadas aos sábados de abril a dezembro, com rodadas no meio da semana onde precisa.
- **Copa Nacional** às quartas, mata-mata de jogo único com os 40 clubes e pênaltis no empate.
- Vitória 3, empate 1, desempate como no Brasileirão. 4 sobem e 4 caem. Premiação por posição e por fase da copa.
- **Avançar** vai até o próximo jogo e para quando chega proposta por um jogador seu. Também dá para jogar ao vivo, simular o jogo, simular até uma data ou até o fim da temporada, sempre com confirmação.
- Avisos (toasts) empilhados: propostas, lesões, janela, caixa negativo, fim de temporada.

### Diretoria e emprego

- Objetivo da temporada pela reputação do clube, confiança de 0 a 100 que sobe com vitórias e desce com derrotas e posição ruim.
- Confiança zero é demissão, com propostas de clubes menores. Uma temporada boa pode trazer propostas de clubes maiores.

### Elenco, treino e evolução

- **Desfalques**: a escalação fica como foi deixada, e quem não pode jogar aparece riscado. Antes do jogo, o jogo pergunta se troca automaticamente; dá para marcar "Sempre trocar desfalques automaticamente".
- **Evolução mensal** (todo dia 1º, de maio a dezembro) pelo jogo e pela idade. Jovens com menos de 21 ganham 50% a mais por jogo. Declínio a partir dos 30 e aposentadoria dos 35 aos 38. A base sobe 1 ou 2 jovens por ano.
- **Potencial em faixa**, que estreita com os jogos e fica exata aos 28.
- **Treino**: foco do elenco (equilibrado, físico, técnico, tático ou descanso) e plano individual (foco e intensidade) para até 30 anos. As setas mostram o foco que mais sobe o geral; "Todos no recomendado" põe todo mundo no melhor.
- **Favoritos**: estrela no elenco e no mercado (lista de observação). Vender um favorito pede confirmação.

### Mercado e contratos

- Janelas em janeiro e julho; sem clube, a qualquer hora. Com a janela fechada a lista mostra os sem clube e "Ver todos para observar".
- Filtros: posição, situação (sem clube, contrato no fim, favoritos), idade, divisão, geral e potencial mínimos, cabe no caixa e ordem.
- Propostas da IA pelos seus jogadores, à venda ou não, com o preço pedido e a diferença. Cada proposta vale 7 dias.
- Contratos de 1 a 5 temporadas, renovação, **empréstimo** de jogadores até 23 anos (até 4 de cada vez) para a divisão de baixo.
- A IA vende quem sobra e compra o que falta, respeitando o caixa.

### Dinheiro

- Bilheteria (público pela reputação, fase e preço, com preço justo sugerido), premiação, vendas e patrocínio. Salários todo dia 1º.
- **Patrocínio master**: três propostas no começo da temporada (segura, equilibrada, ousada), com bônus por meta e duração de 1 a 3 temporadas. Patrocínios menores de manga, costas e calção.
- Estádio com capacidade fixa e preço do ingresso ajustável.

### Editor e pacotes de dados

- Editor de times dentro do jogo e na tela `/editor`: renomear clubes (nome, sigla, cidade, cores) e jogadores. Importar e exportar pacote em JSON ou planilha CSV.
- Prompt pronto para montar um pacote com elencos reais num assistente de IA com busca (`src/ui/aiPackPrompt.ts`).
- O pacote **Brasileirão 2026** (`src/packs/brasileirao-2026.json`) traz os clubes das Séries A e B e os elencos, com a força puxada pelas notas do início de 2026 e pelo desempenho na temporada. Sem escudos, fotos nem uniformes oficiais.

---

## Draft com amigos

Um grupo cria uma sala, monta os elencos num draft (cada jogador só pode ir para um time) e joga uma liga entre esses times. Não tem dinheiro, treino, idade nem contratos.

### Sala

- Criar exige passe; entrar pelo convite (link com código de 8 letras) é grátis. Cada um dá nome, sigla, cores e escudo ao time.
- De 2 a 18 times, sempre par. Vagas sem dono viram robôs.
- Opções: elenco de 16, 18 ou 20; tempo por escolha de 30 a 90 s; ordem em serpentina ou invertida na terceira volta; só ida ou ida e volta; lesões normais, curtas ou desligadas; trocas a liga toda, até dois terços ou desligadas.
- Na sala de espera cada um marca "Pronto"; com a sala cheia e todos prontos, o draft começa sozinho. O dono pode começar antes, com robôs no lugar de quem falta, e pode apagar a sala a qualquer momento.

### Draft (estilo FUT Draft)

- Cada um escolhe a formação antes da primeira carta. Na sua vez, toca numa vaga vazia e o servidor abre 5 cartas daquela posição, com mais chance para as fortes; fica com uma e as outras voltam ao monte.
- Depois dos 11 titulares vêm as reservas por setor: goleiro, defensor (zagueiro ou lateral), meia e atacante.
- **Cartas prime**: de vez em quando uma das cartas mais fracas sai roxa, com 8 a 12 de geral a mais (no máximo 89), só naquela sala.
- Se o tempo acaba, fica a melhor carta. Robôs escolhem com alguns segundos de espera e nem sempre pegam a melhor. A ordem fica sempre à vista e a última escolha aparece para todos.

### Liga

- Menu próprio, como o da carreira: **Resumo**, **Time**, **Mercado**, **Tabela** (classificação e artilharia), **Rodadas** (todas as jogadas, com o botão de assistir) e **Sala**.
- Cada um escala e marca **Pronto**. A rodada é jogada quando todos marcam, ou quando o dono joga sem esperar. Quem não marcou joga com a última escalação.
- **Rodada ao vivo**: todos assistem aos jogos no campinho ao mesmo tempo, sem spoiler da tabela até o fim. Se todos tocam em **Acelerar**, ela corre 4 vezes mais rápido.
- **Mercado da sala**: até 2 pedidos de jogadores livres por rodada (o pior colocado é atendido primeiro), trocas de 1 a 3 jogadores com aceite dos dois lados e botão **Comparar**, dispensas. Todo elenco mantém 2 goleiros.
- Fim da liga: campeão, artilheiro, melhor jogador e **Revanche**.
- **Avisos** por notificação do PWA: draft começou, sua vez, falta só você dar Pronto, rodada ao vivo, proposta de troca.

### Como roda no servidor

- Tabelas `rooms`, `room_members`, `room_pool`, `room_picks` (único por sala e jogador), `room_lineups`, `room_moves`, `room_rounds`, `room_states` e as de apoio. O estado inteiro fica comprimido e só o servidor lê a semente; cada rodada recebe semente nova, para o replay não entregar o futuro.
- Funções do Postgres para escolher, marcar Pronto, escalar e o mercado; funções Deno `room-draft`, `room-round`, `room-market` e `room-notify`, com as regras de `src/engine/room/`. O Realtime do Supabase atualiza o draft e a liga na hora.
- `ROOM_RULES_VERSION` fica gravada na sala, para uma correção no meio não mudar resultados já jogados.
- `npm run room` simula salas inteiras no automático.

---

## Plataforma

### Conta e nuvem

- A conta é opcional e entra com um **código de 6 dígitos** no e-mail (Supabase Auth com SMTP do Resend). Sem senha, sem Google por enquanto.
- **Save na nuvem**: a carreira sincroniza entre aparelhos, compactada (uns 150 KB). A conta grátis guarda uma carreira na nuvem; o limite de cada conta fica em `entitlements`. Conflito entre dois aparelhos pergunta qual fica.
- A tela inicial avisa quando as carreiras estão só naquele navegador.

### Passe

- Passe de **30 dias por R$ 5,00** (`PASS_PRICE_CENTS`), pago no **Mercado Pago** (Checkout Pro, Pix e cartão à vista). Libera criar salas durante o mês; uma sala criada no prazo vai até o fim. Comprar de novo soma 30 dias.
- O webhook confere a assinatura, consulta o pagamento na API e grava em `passes`. Há passe de cortesia e vitalício pelo SQL (veja o README).
- Princípio: pagar nunca dá vantagem dentro da sala.

### Jurídico

- Página **Aviso legal** (`/aviso-legal`): jogo independente, sem ligação com clubes ou atletas, e canal para pedir correção ou remoção de um nome do pacote.
- Página **Privacidade** (`/privacidade`), com conta, nuvem, salas, notificações e pagamento.
- Os nomes reais ficam num pacote separado do motor, para tirar um nome sem mexer no resto. Antes de crescer a parte paga, vale falar com um advogado.

### Nome e infraestrutura

- O jogo se chama **onzemestre** (`onzemestre.com`), publicado na Vercel. O Supabase cuida de conta, nuvem, salas, passe e avisos.
- Ficam com o nome antigo de propósito: as chaves `futmanager-*` do localStorage, o banco `futmanager` do IndexedDB e o formato `futmanager-pacote`. Trocar apagaria os saves e invalidaria pacotes exportados.

### Desligado

A **Fantasia online** (estilo Cartola, com pontos do motor) funcionou de 16 a 20/10/2026 e saiu para dar lugar ao draft. As tabelas foram apagadas, menos `passes` e `push_subscriptions`. O código está no histórico do git. A página **Aprenda** saiu no PR #99.
