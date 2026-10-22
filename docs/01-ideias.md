# Ideias para o futuro

Tudo o que os planos 00 a 17 citaram e que **ainda não existe** no jogo (conferido na `main` em 22/10/2026, commit `602c1de`). O que já existe está em [00-o-jogo-hoje.md](00-o-jogo-hoje.md). Sem ordem dentro de cada grupo; cada ideia vira um plano novo em `docs/` quando chegar a vez.

## Em andamento

- **Balanceamento das partidas** (pesquisa 17): o motor é achatado demais, e 30 pontos de geral rendem só 70% de vitórias. A proposta escolhida é `strengthScale 115 → 70`, `homeAdvantage 9 → 5.5` e `conversion 0.27 → 0.26`, com o teste das zebras ajustado, mais 3 e 4 turnos como opção na sala (hoje são turno único ou ida e volta). Ainda não está na `main`.
- **Pacote da Champions League 2026/27** (PR #98, aberto): pacote tirado do FotMob, para a carreira e para as salas.

## Partida e motor

- **Técnico pesar mais no jogo equilibrado**: entre times de 78 e 80, escalação, funções e forma deveriam decidir mais. Hoje esses efeitos são de 1 a 3% (proposta C da pesquisa 17).
- **Assistências**: o motor escolher quem deu o passe de cada gol, para aparecer na seleção da rodada e na ficha.
- **Rever os gols da carreira**: tocar num jogo já jogado e ver o lance no campo 2D, como nas salas. Precisa guardar a escalação usada em cada jogo.

## Carreira

- **Ampliação do estádio** em blocos, com custo, tempo de obra e aprovação da diretoria; a IA também amplia. Mexe no save e pede `npm run balance`.
- **Material esportivo e naming rights** no patrocínio.
- **Nível de dificuldade**: o fácil mostra as setas do treino e o potencial mais preciso; o difícil esconde as setas, alarga a faixa e deixa a diretoria mais exigente.
- **Mercado**: filtro por função, filtro "salário cabe na folha", aviso quando um jogador observado fica disponível na abertura da janela.
- **Simular até uma data** com a opção de parar quando um titular ficar fora.
- **Mais países e competição continental** (uma "Libertadores"), usando o calendário com datas.
- **Seleções** e convite para treinar uma seleção.
- **Página de ajuda**: a Aprenda saiu no PR #99. Se voltar, a pesquisa 16 tem o texto enxuto em três abas (Em campo, Carreira, Draft).

## Draft com amigos

- **Leilão com orçamento** no lugar da serpentina, usando preços por geral e desempenho.
- **Misturar pacotes** numa sala (Brasileirão + Champions), juntando jogadores repetidos.
- **Renovar a sala** na temporada seguinte mantendo os elencos, além da Revanche que começa do zero.
- **Veto do dono** em trocas, se aparecer troca combinada.
- **Liga de carreira entre amigos**: cada amigo como técnico de um clube no mesmo mundo, com dinheiro, mercado e evolução. O `GameState` supõe um técnico só, então é a parte grande.

## Plataforma

- **Mais carreiras na nuvem** como compra (a tabela `entitlements` já guarda o número, hoje 1 na conta grátis).
- **Entrar com o Google** de volta na tela de conta.
- **Reembolso** pela tela, em vez de à mão no painel do Mercado Pago.
- **Lojas de celular** (Capacitor) e **Steam** (Tauri). Nas lojas a compra do passe passa pela loja, que fica com uma parte.
- **Conversa com um advogado** antes de ampliar a parte paga com nomes reais.

## Já descartadas

Ficam aqui para não voltarem sem motivo novo:

- **Fantasia no estilo Cartola** (jogada entre 16 e 20/10/2026): solitária, os amigos só se encontravam na classificação. Trocada pelo draft.
- **Desafio da semana** (todos jogam a mesma carreira): o resultado sai do navegador e é fácil trapacear.
- **Copa dos amigos com o elenco da carreira solo**: quem está na décima temporada atropela quem começou ontem.
- **Postura do time** (defensiva, normal, ofensiva) e **escalar automaticamente** na sala: saíram para a escalação e as funções decidirem.
- **Funções que repetiam estilos** (Goleiro-líbero, Xerife, Zagueiro construtor, Box-to-box, Pivô).
- **Dividir as posições** em VOL/MC/MEI/PE/PD/CA: as funções resolvem sem reeditar os pacotes.
- **Tirar a aleatoriedade dos gols**: com uns 2,5 gols por jogo, jogos entre times parecidos sempre ficam perto de 45/27/28.
