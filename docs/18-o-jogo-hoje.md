# O jogo hoje

Retrato do onzemestre em 22/10/2026, conferido no código da `main` (commit `602c1de`). Substitui os planos 00 a 17, que continuam no histórico do git (o último commit com eles é `602c1de`). O que ainda não existe está em [19-ideias.md](19-ideias.md), e o passo a passo para pôr o servidor no ar em [20-como-por-no-ar.md](20-como-por-no-ar.md).

O jogo tem dois modos: a **Carreira**, solo e offline, e o **Draft com amigos**, online. Os dois usam o mesmo motor de partida, as mesmas cartas e a mesma tela de escalação.

## Plataforma

- **Site**: onzemestre.com, um PWA (instala no celular e no computador, abre offline). Vite + React + TypeScript, Tailwind v4 e shadcn/ui, publicado na Vercel a cada merge na `main`.
- **Motor** em TypeScript puro (`src/engine`), sem React e determinístico a partir de uma semente (`rng.ts`, `mixSeed`). O mesmo código roda no navegador (num Web Worker, `src/worker`) e no servidor (funções do Supabase em Deno).
- **Saves** no IndexedDB (Dexie), um slot por carreira, com migração de versões antigas em `src/engine/save.ts` (versão 16 hoje).
- **Conta opcional** (Supabase): login por um código de 6 dígitos no e-mail. Sem conta, a carreira funciona inteira offline.
- **Save na nuvem**: a conta grátis guarda 1 carreira na nuvem; o limite de cada conta fica em `entitlements` (5 para quem pagar, ainda sem compra ligada). Conflito entre aparelhos pergunta qual versão fica.
- **Passe de 30 dias** (R$ 5,00, Mercado Pago com Pix e cartão à vista): exigido só para criar sala de draft. Entrar em sala é grátis. Dá para dar passe de cortesia ou vitalício pelo banco.
- **Avisos** por notificação do PWA (Web Push próprio, sem e-mail), usados nas salas.
- **Tema** claro e escuro, escuro por padrão. Páginas de Aviso legal e Privacidade.

## Dados e pacotes

- **Mundo gerado**: 40 clubes fictícios em Série A e Série B, com nomes brasileiros gerados.
- **Pacote Brasileirão 2026** (`src/packs/brasileirao-2026.json`): clubes reais das duas séries, com nome, sigla, cidade e cores, e os jogadores de cada elenco (até 32 por clube), com força baseada nas notas do início de 2026. Sem escudos, fotos nem uniformes oficiais; o escudo é desenhado com as cores e a sigla.
- **Editor de times** (aba Editor em Clube e tela `/editor`): renomear clubes e jogadores, importar e exportar pacote em JSON ou planilha CSV. Traz um prompt pronto para montar um pacote com uma IA com busca na internet (`src/ui/aiPackPrompt.ts`). Pacotes do usuário ficam só no navegador dele.
- **Aviso legal** explica os nomes reais e dá o canal para pedir correção ou remoção.

## Em campo (vale nos dois modos)

### Partida

- Simulação minuto a minuto (`match/simulate.ts`): posse pelo meio-campo, chance pelo ataque contra a defesa, finalização contra o goleiro, bolas aéreas, contra-ataque pela velocidade, cansaço, cartões e lesões. Mandante tem vantagem.
- Medido em 20 temporadas: uns 2,5 gols por jogo e o mandante vence uns 45%. `npm run balance` confere.
- **Campo 2D** animado em canvas (`MatchPitch`), encenando o lance que o motor sorteou: passes, chutes, defesas, desarmes, troca de lado no intervalo e uniformes que não se confundem. Narração em texto ao lado.
- Estatísticas ao vivo (posse, finalizações, faltas, cartões) e notas de 3 a 10 dos dois times; no celular, em abas.
- Durante o jogo: até 5 substituições, mudar a formação, trocar jogadores de lugar e mudar funções. Velocidades Normal e Rápido.
- Assistir ou só simular dá o mesmo placar, porque cada partida tem a sua semente. Isso permite rever um jogo pelo replay (`MatchReplay`).

### Escalação

- 10 formações: 4-4-2, 4-3-3, 3-5-2, 4-5-1, 5-3-2, 3-4-3, 4-2-4, 5-4-1, 4-1-4-1 e 4-2-3-1. A postura e o "escalar automaticamente" saíram em 21/10/2026.
- Cinco posições (G, Z, L, M, A) com posições secundárias. Fora da posição o jogador rende 97% (secundária) ou 92%; a cor no campo mostra isso.
- Cada vaga tem uma **função** que decide para onde vai a força do jogador (defesa, meio, ataque) e quanto ele chuta: as da formação (zagueiro, lateral, ala, volante, meia, meia ofensivo, pontas, centroavante, segundo atacante) e seis que mudam o jeito de jogar (Ala ofensivo, Lateral invertido, Regista, Atacante sombra, Corta pra dentro e Falso 9). Qualquer função do setor pode ir em qualquer vaga, e as de ponta também numa vaga central.
- Escalação no campo com arrastar ou tocar para trocar, ou em lista. 7 no banco.

### Jogadores e cartas

- 26 atributos, resumidos em 6 números na carta (Ritmo, Finalização, Passe, Drible, Defesa e Físico; o goleiro tem os seus). O **geral** pesa os que importam para a posição. Pé bom, perna ruim e posições secundárias.
- Carta bronze, prata ou ouro pelo geral, com o escudo do clube. Cartas especiais para a seleção da rodada e o craque da temporada.
- **17 playstyles** (Paredão, Muralha, Finalizador, Velocista, Chute de longe, Incansável...) que saem dos atributos, no máximo 3 por jogador, com versão "+". Cada um dá um bônus no lance em que conta. Nunca se perdem; o "+" pode cair com a idade. Quem tem geral 65 ou mais tem ao menos um.
- **Energia** que cai no jogo e volta com os dias, **forma** pelas últimas 5 notas, **cartões** (vermelho ou 3 amarelos suspendem um jogo) e **lesões** de 8 a 38 dias.

## Carreira

- **Novo jogo**: mundo gerado ou pacote (Brasileirão 2026 ou um importado). Vários saves, autosave, sincronização opcional com a nuvem.
- **Menu**: Resumo, Time, Mercado, Competições, Calendário e Clube. Barra lateral no computador; no celular, menu de gaveta e o caixa e a data no topo.
- **Temporada com datas**: pré-temporada em janeiro, 38 rodadas de abril a dezembro, datas FIFA, Copa Nacional às quartas. "Avançar até o próximo jogo" (para quando chega proposta), "Simular jogo", "Simular até uma data" no calendário e "Simular até o fim".
- **Competições**: Série A e B com 4 sobem e 4 caem, desempate do Brasileirão, artilharia, Copa Nacional mata-mata com os 40 clubes e pênaltis, premiação em dinheiro. Tocar num clube abre a ficha dele, com elenco, escalação da IA e últimos resultados.
- **Diretoria**: objetivo da temporada, confiança que sobe e desce com os resultados, demissão e propostas de outros clubes.
- **Time**: elenco com idade, condição, contrato e treino; renovar (ícone vermelho quando o contrato vence), pôr à venda, favoritar. **Desfalques** não são trocados sozinhos: o jogo avisa e pergunta, com a opção "Sempre trocar desfalques automaticamente".
- **Treino**: foco do elenco (equilibrado, físico, técnico, tático ou descanso) e plano individual com foco e intensidade, com setas que indicam o foco que mais sobe o geral.
- **Evolução** todo mês de maio a dezembro, mais rápida para jovens que jogam; declínio depois dos 30, aposentadoria a partir dos 35, base com 1 ou 2 jovens por ano. **Potencial em faixa**, que estreita com os jogos.
- **Mercado**: janelas em janeiro e julho (sem clube a qualquer hora), filtros por situação (sem clube, contrato no fim, favoritos), idade, divisão, geral e potencial; propostas recebidas com "à venda por" ou "não estava à venda"; empréstimo de jovens até 23 anos para a divisão de baixo. A IA compra e vende respeitando o caixa.
- **Clube**: Visão do clube (diretoria, patrocínio, estádio), Finanças, Histórico e Editor. Patrocínio master com três propostas por temporada (segura, equilibrada, ousada) e patrocínios menores de manga, costas e calção. Estádio com preço do ingresso e preço justo sugerido; a capacidade é fixa.
- **Avisos** em toasts empilhados (propostas, lesões, janela, caixa negativo, fim de temporada) e confirmação antes de simular.

## Draft com amigos (salas)

Telas em `/salas` e `/sala/:id`, regras em `src/engine/room/`, servidor em `supabase/functions/room-*`.

- **Criar a sala**: pede o passe. Nome e número de times (de 2 a 18, sempre par); o resto vem com padrão e pode ser mudado: elenco de 16, 18 ou 20, tempo por escolha (30 a 90 s), só ida ou ida e volta, lesões normais, curtas ou desligadas, e trocas a liga toda, até dois terços ou desligadas. Convite por link com código.
- **Sala de espera**: cada um marca "Pronto"; com a sala cheia e todos prontos o draft começa sozinho, ou o dono começa antes com robôs nas vagas livres.
- **FUT Draft**: cada um escolhe a formação, e na sua vez toca numa vaga vazia; o servidor abre 5 cartas daquela posição, sorteadas com mais chance para os mais fortes, e a pessoa fica com uma. Depois dos titulares vêm as reservas por setor. Ordem em serpentina invertida na 3ª volta, relógio na tela, e se o tempo acaba fica a melhor carta. Todos veem as cartas virando. Robôs escolhem sozinhos, nem sempre a melhor.
- **Cartas prime**: em cerca de 1 a cada 12 aberturas, uma carta fraca sai roxa, de 8 a 12 pontos mais forte (no máximo 89), valendo só naquela sala.
- **Liga**: menu com Resumo, Time, Mercado, Tabela, Rodadas e Sala. Cada um escala e marca "Pronto"; a rodada é jogada quando todos marcam, ou quando o dono joga sem esperar. Sem dinheiro, treino, idade nem contratos; os atributos não mudam durante a sala.
- **Rodada ao vivo**: todos assistem aos jogos no campinho ao mesmo tempo, com os placares dos outros jogos; a tabela só muda quando o jogo acaba ou a pessoa pula. Se todos tocam em **Acelerar**, a rodada corre mais rápido. Cada jogo fica para rever na página Rodadas.
- **Mercado da sala**: pedir até 2 livres por rodada (o pior colocado tem preferência), trocar de 1 a 3 jogadores com um amigo (com **Comparar** as cartas antes de aceitar), dispensar. Todo elenco mantém 2 goleiros. Mural com as movimentações.
- **Avisos**: é a sua vez no draft, falta só você dar "Pronto", rodada ao vivo, proposta de troca.
- **Fim da liga**: campeão, artilheiro, melhor jogador e "Revanche". O dono pode apagar a sala a qualquer momento.
- Cada sala guarda a versão das regras e a semente fica só no servidor, nova a cada rodada, para o replay não entregar o futuro.

## Ferramentas para desenvolver

| Comando                    | Para quê                                                                                 |
| -------------------------- | ---------------------------------------------------------------------------------------- |
| `npm run balance -- 50`    | Simula temporadas inteiras e mostra se o mundo fica equilibrado                          |
| `npm run room -- 200`      | Joga salas inteiras no automático para ver o equilíbrio do draft                         |
| `npm run pack:performance` | Ajusta as notas do pacote do Brasileirão pelo desempenho na temporada (FotMob e Cartola) |

## O que já saiu do jogo

Para não procurar o que não existe mais: a **Fantasia online** (estilo Cartola, desligada em 20/10/2026 para dar lugar ao draft), a página **Aprenda** (removida em 22/10/2026), o **Amistoso**, a **postura** do time, o "escalar automaticamente" e o checkout pelo **Stripe** (trocado pelo Mercado Pago, porque o Stripe passou a pedir CNPJ). O código de cada um está no histórico do git.
