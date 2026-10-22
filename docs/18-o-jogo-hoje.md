# O jogo hoje

Retrato do onzemestre em 22/10/2026 (commit `602c1de`, PR #99). Junta o que os planos 00 a 16 entregaram e que continua no ar; os planos foram tirados de `docs/` e seguem no histórico do git. O que ainda não foi feito está em [19-ideias.md](19-ideias.md), e a configuração do servidor em [20-operacao.md](20-operacao.md).

São dois modos: a **Carreira**, solo e offline, e o **Draft com amigos**, online. Os dois usam o mesmo motor de partida, as mesmas cartas e a mesma escalação.

## Plataforma

- **Site** em onzemestre.com (Vercel), instalável como PWA e jogável offline. Vite, React, TypeScript, Tailwind e shadcn/ui; tema escuro por padrão, com claro como opção.
- **Motor** em TypeScript puro (`src/engine`), determinístico a partir de uma semente (`rng.ts`). A rodada da carreira roda num Web Worker; as rodadas das salas rodam no servidor, com o mesmo código.
- **Saves** no IndexedDB, um slot por carreira, com migração a cada mudança de formato (`SAVE_VERSION` em `src/engine/save.ts`).
- **Conta opcional** (Supabase), com login por código de 6 dígitos no e-mail. Sem conta o jogo inteiro da carreira funciona.
- **Save na nuvem**: com conta, as carreiras sincronizam entre aparelhos; conflito pergunta qual fica. A conta grátis guarda 1 carreira na nuvem (`entitlements.cloud_slots`).
- **Passe de 30 dias** (R$ 5,00, Mercado Pago com Pix e cartão): exigido só para criar sala de draft. Entrar em sala é grátis. Pagar nunca dá vantagem em campo. A aba Assinatura da conta mostra os dias restantes e os pagamentos.
- **Avisos** por notificação do PWA (sem e-mail) para os momentos da sala.
- **Tela inicial**: continuar a última carreira, lista de carreiras com o que está só no aparelho ou na nuvem, Nova carreira, Draft com amigos, conta, aviso de beta e a versão do jogo. Aviso legal e Política de privacidade no rodapé.

## Carreira

### Mundo e temporada

- **Novo jogo**: mundo gerado (times e jogadores fictícios) ou um pacote. O pacote **Brasileirão 2026** vem com o jogo: clubes das Séries A e B com nome popular, cores aproximadas e elencos de até 32 jogadores, com notas puxadas do desempenho na temporada (FotMob e Cartola). Também dá para importar um pacote próprio.
- Série A e Série B com 20 clubes, turno e returno, 4 sobem e 4 caem. **Copa Nacional** mata-mata de jogo único com os 40 clubes, pênaltis no empate.
- **Calendário com datas**: pré-temporada em janeiro, liga aos sábados de abril a dezembro, copa às quartas, janelas de transferência em janeiro e julho. Salários e patrocínio no dia 1º.
- Avançar até o próximo jogo (para quando chega proposta por um jogador seu), jogar ao vivo, simular o jogo, simular até uma data escolhida no calendário ou até o fim da temporada, com confirmação antes.
- Fim de temporada: premiação, acesso e rebaixamento, aposentadorias, base, contratos vencidos e seleção da temporada.

### Menu

Resumo, Time, Mercado, Competições, Calendário e Clube (barra lateral no computador, gaveta no celular, com caixa e data no topo).

- **Resumo**: próximo jogo com a posição dos dois times, avisos, resultados, seleção da rodada em lista.
- **Competições**: Série A, Série B e Copa, com classificação (ou chave), artilharia e jogos. Tocar num clube abre a ficha dele: escalação que a IA usaria, força por setor, elenco e últimos resultados.
- **Clube**: Visão do clube (diretoria, patrocínios, estádio), Finanças, Histórico e Editor.
- Avisos em toasts empilhados, no máximo três por vez.

### Time e escalação

- Dez formações (4-4-2, 4-3-3, 3-5-2, 4-5-1, 5-3-2, 3-4-3, 4-2-4, 5-4-1, 4-1-4-1, 4-2-3-1), campo visível por padrão e lista como alternativa. Arrastar ou tocar para trocar.
- Cinco posições (G, Z, L, M, A) com posições secundárias; a cor mostra o encaixe na vaga.
- **Funções**: cada vaga tem a função da formação (volante, meia, ponta, centroavante...) e pode trocar para qualquer função do setor, inclusive as especiais (Ala ofensivo, Lateral invertido, Regista, Atacante sombra, Corta pra dentro, Falso 9). A função muda o peso do jogador em defesa, meio e ataque e quanto ele chuta.
- **Desfalques**: lesionados e suspensos ficam riscados na escalação; antes do jogo, o jogo pergunta se troca sozinho. Uma opção deixa a troca sempre automática.
- **Favoritos**: estrela no elenco, no mercado e na carta, com confirmação antes de vender um favorito.
- Elenco com idade, condição, forma, contrato e a evolução do último mês, legível no celular.

### Partida

- Ao vivo no **campo 2D** (pontinhos com o uniforme da partida, bola que corre, troca de lado no intervalo) ou **só texto**, nas velocidades Normal e Rápido.
- Estatísticas e notas dos dois times ao vivo; no celular, em abas.
- Até 5 substituições, troca de formação e de posições durante o jogo.
- O motor decide tudo minuto a minuto pela força dos setores, pelas funções e pelos estilos; a animação só encena. Assistir ou simular dá o mesmo placar.

### Jogadores

- **Cartas** com 6 números de face (ou os de goleiro), geral pela posição, bronze/prata/ouro, escudo do clube, pé bom e perna ruim. Cartas especiais para a seleção da rodada e o craque da temporada.
- **Estilos de jogo** (17, como Paredão, Muralha, Finalizador, Chute de longe, Incansável), tirados dos atributos, até 3 por jogador, com versão "+". Nunca se perdem; o "+" pode cair com a idade. Quem tem geral 65 ou mais tem pelo menos um.
- Energia que passa de um jogo para o outro, forma das últimas 5 notas, nota de 3 a 10 por jogo.
- Cartões (vermelho ou 3 amarelos suspendem) e lesões de 8 a 38 dias.

### Evolução e treino

- Evolução mensal (maio a dezembro) pelo tempo de jogo e pela idade; jovens até 21 anos crescem mais rápido.
- **Potencial em faixa**, que estreita com os jogos e fica exata aos 28.
- **Treino**: foco do elenco (equilibrado, físico, técnico, tático, descanso) e plano individual com foco e intensidade; setas indicam o foco que mais sobe o geral, e um botão põe todos no recomendado.
- Base com 1 ou 2 jovens por ano; aposentadoria a partir dos 35.

### Mercado

- Contratar com filtros (situação, idade, divisão, geral e potencial mínimos, cabe no caixa, ordem) e paginação. Com a janela fechada, só os sem clube.
- Propostas recebidas mostram se o jogador estava à venda e a diferença para o preço pedido.
- Renovação, venda, dispensa e **empréstimo** de jovens até 23 anos para a divisão de baixo.
- IA dos clubes compra e vende respeitando o caixa.

### Clube e dinheiro

- Bilheteria pelo preço do ingresso (com o preço justo sugerido), salários, premiações e vendas.
- **Patrocínio master** com três propostas por temporada (segura, equilibrada e ousada) e patrocínios menores de manga, costas e calção.
- **Diretoria** com objetivo da temporada e confiança; demissão em zero e propostas de outros clubes.

### Editor e pacotes

- Editor de times (aba Editor do Clube e `/editor`): renomear clubes e jogadores, importar e exportar pacote em JSON ou planilha CSV, e um prompt pronto para montar um pacote com uma IA com busca.
- Nomes reais ficam num pacote separado do motor, sem escudos, fotos nem uniformes oficiais. O Aviso legal explica isso e dá o canal de remoção.

## Draft com amigos

### Sala

- Criar exige o passe; entrar pelo convite (link ou código de 8 letras) é grátis.
- De 2 a 18 times, sempre par; vagas sem dono viram robôs. Elenco de 16, 18 ou 20, ordem em serpentina (ou invertida na 3ª volta), 30 a 90 segundos por escolha, reservas no automático ou na mão, turno único ou ida e volta, lesões normais, curtas ou desligadas, trocas na liga toda, até 2/3 dela ou desligadas.
- Cada um dá nome, sigla, cores e escudo ao time.
- Sala de espera: cada um marca "Pronto"; com a sala cheia e todos prontos o draft começa sozinho, ou o dono começa antes com robôs nas vagas livres. O dono pode apagar a sala a qualquer momento.

### FUT Draft

- Cada um escolhe a formação antes da primeira carta. Na sua vez, toca numa vaga vazia e o servidor abre **5 cartas** daquela posição, sorteadas entre os livres com mais chance para os fortes; fica com uma e as outras voltam.
- Depois dos 11 titulares vêm as reservas por setor (goleiro, defensor, meia, atacante).
- Ordem em serpentina, sempre à vista. Todos veem as cartas virando, da melhor para a pior. Tempo esgotado fica com a melhor carta.
- **Cartas prime**: em cerca de 1 a cada 12 aberturas, uma carta sai roxa, de 8 a 12 de geral acima (até 89), valendo só naquela sala.
- Cada jogador é o mesmo em toda sala do mesmo pacote (semente fixa por pacote).

### Liga

- Menu próprio: Resumo, Time, Mercado, Tabela, Rodadas e Sala.
- Cada um escala e marca **Pronto**; a rodada é jogada quando todos marcam, ou quando o dono joga sem esperar. Quem não marcou joga com a última escalação, sem os desfalques.
- **Rodada ao vivo**: a sala inteira assiste aos jogos no mesmo minuto, no campinho ou em texto (texto por padrão), sem spoiler da tabela até o fim. Se todos tocarem em **Acelerar**, ela corre 4 vezes mais rápido.
- Rodadas anteriores podem ser assistidas de novo. Fim da liga com campeão, artilheiro, melhor jogador e **Revanche**.
- Sem dinheiro, treino, idade nem contratos: os atributos não mudam durante a sala.

### Mercado da sala

- Pedir jogadores livres (o pior colocado é atendido primeiro, até 2 por rodada), dispensar e trocar de 1 a 3 jogadores com um amigo, com **Comparar** para ver as cartas lado a lado. Todo elenco mantém 2 goleiros. As trocas aparecem no mural.

### Avisos

Draft começou, é a sua vez, só falta você dar "Pronto", rodada ao vivo e proposta de troca.

## Decisões que continuam valendo

- **Nomes reais** num pacote separado, sem escudos nem imagens oficiais, com canal de remoção. Falar com um advogado antes de ampliar a parte paga. Prêmio em dinheiro fica fora (aproximaria das regras de apostas).
- **Pagar nunca dá vantagem** em campo.
- **Resultados online saem só do servidor**, com semente nova a cada rodada, para o replay não revelar o futuro e ninguém trapacear pelo navegador.
- **Posições** G/Z/L/M/A com posições secundárias e funções por cima, sem dividir as posições.
- **Carreira sem conta e offline**; a nuvem é opcional.
- Equilíbrio conferido com `npm run balance` (carreira) e `npm run room` (draft) antes de mexer no motor.
