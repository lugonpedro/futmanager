# Ideias para o futuro

Tudo o que os planos 00 a 17 citaram e que ainda **não** existe na `main` (conferido em 22/10/2026, PR #99), mais o que está em discussão. O que já existe está em [18-o-jogo-hoje.md](18-o-jogo-hoje.md). Nada aqui tem ordem fechada: cada item vira um plano próprio quando chegar a vez.

## Em andamento

| Ideia                           | Situação                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Balanceamento da partida**    | Discussão aberta em `pesquisa/17-balanceamento-partidas.md`. Hoje uma diferença de 30 pontos de geral rende só uns 70% de vitórias. A proposta A (`strengthScale 115 → 70`, `homeAdvantage 9 → 5.5`, `conversion 0.27 → 0.26`) deixa a força pesar mais. A B volta a oferecer mais turnos na sala (até 4). Nenhuma das duas está na `main`. |
| **Pacote da Champions 2026/27** | PR #98, aberto: 40 clubes e uns 1.000 jogadores com notas do FotMob, para o draft e o Novo jogo.                                                                                                                                                                                                                                            |

## Partida e motor

- **O técnico pesar mais no jogo equilibrado** (proposta C do 17): entre times de 78 e 80, escalação, funções e forma deveriam decidir mais. Hoje esses efeitos são de 1 a 3%.
- **Assistências**: o motor escolher quem deu o passe em cada gol, para a ficha, a seleção da rodada e a artilharia.
- **Postura do time** de volta, se fizer falta: o motor ainda conhece defensiva, normal e ofensiva, mas nenhuma tela deixa escolher.
- **Mais posições de cadastro** (VOL, MC, MEI, PE, PD, CA no lugar de M e A): ficou de fora porque obriga a reeditar os pacotes; as funções cobrem boa parte.

## Carreira

- **Rever os gols dos jogos já jogados**: tocar num resultado e ver o lance no campo 2D, com o `MatchReplay` que as salas já usam. Precisa conferir se a escalação de cada jogo cabe no save.
- **Ampliação do estádio** em blocos, com custo, obra de alguns meses e capacidade reduzida durante a obra. A IA também amplia. Mexe no save e pede `npm run balance`.
- **Patrocínio de material esportivo e naming rights** do estádio.
- **Nível de dificuldade**: o fácil mostra as setas do treino e o potencial mais preciso; o difícil esconde as setas, alarga a faixa e deixa a diretoria mais exigente.
- **Mercado**: filtro pela função do jogador, filtro "o salário cabe" e aviso quando a janela abre com jogadores da lista de observação disponíveis.
- **Desfalques**: opção de parar "Simular até uma data" e "até o fim" quando um titular ficar fora.
- **Mais países e competição continental** (uma Libertadores fictícia ou a Champions do pacote, com fase de liga e mata-mata). Pede mudar o formato do pacote e o calendário.
- **Seleções** e convite para treinar a seleção.
- **Exportar e importar a carreira** em arquivo (hoje só pela nuvem).

## Draft com amigos

- **Leilão com orçamento** no lugar da serpentina, usando preços pelo geral.
- **Misturar pacotes** numa sala (Brasileirão + Champions), com a regra para jogador repetido.
- **Pacotes do editor** nas salas: o servidor teria de conferir o arquivo, e hospedar nomes enviados por qualquer um aumenta o risco jurídico.
- **Veto do dono** às trocas, se aparecer abuso.
- **Mural da sala com comentários** (hoje o mural só mostra as trocas).
- **Prints e ajuda do draft**: a página Aprenda saiu; se a ajuda voltar, ela pode ser curta e separada por modo (a estrutura pensada está em `pesquisa/16-aprenda-enxuto.md`).

## Online além do draft

- **Liga de carreira entre amigos**: cada amigo dirige um clube do mesmo mundo, com caixa, mercado e treino. A parte grande é o `GameState` com vários técnicos (`userClubId` está em todo canto).
- **Ranking ou ligas públicas** com desconhecidos.
- **Chat ao vivo** durante a rodada.

## Plataforma

- **Entrar com o Google**, que saiu da tela de conta.
- **Lojas**: Steam (Tauri) e celular (Capacitor), com a compra do passe pela loja.
- **Mais saves na nuvem** como compra única: `entitlements` já guarda o limite de cada conta, só falta vender.
- **E-mail do domínio** (`@onzemestre.com` no Resend) e um advogado antes de crescer a parte paga com nomes reais.
- **Reembolso** sem passar pelo painel do Mercado Pago.

## Deixado de lado

Já discutido e descartado, para não voltar sem motivo novo:

- **Fantasia online** estilo Cartola: funcionou e saiu para dar lugar ao draft.
- **Desafio da semana** (todos jogam a mesma carreira): o resultado sai do navegador e é fácil trapacear.
- **Copa dos amigos com o elenco da carreira solo**: quem está na décima temporada atropela quem começou ontem.
- **Prêmio em dinheiro** em qualquer modo: chega perto das regras de apostas.
- **Anúncios**: rendem pouco para esse tipo de jogo e irritam.
