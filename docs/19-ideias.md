# Ideias para o futuro

O que os planos 00 a 17 citaram e ainda não existe no código da `main` (commit `602c1de`, 22/10/2026), mais o que está em andamento. Sem ordem de prioridade dentro de cada grupo; cada ideia vira um plano próprio quando chegar a vez. O que já existe está em [18-o-jogo-hoje.md](18-o-jogo-hoje.md).

## Em andamento

- **Balanceamento das partidas** (PR #100, em discussão): a força do elenco passa a pesar mais (`strengthScale 115 → 70`, `homeAdvantage 9 → 5.5`, `conversion 0.27 → 0.26`). Hoje um time de 90 contra um de 60 vence só 70% dos jogos; com a mudança, 84%. A sala volta a oferecer 3 turnos e ganha 4, para a sorte de cada jogo pesar menos numa liga curta.
- **Pacote da Champions League 2026/27** (PR #98), para escolher no draft.

## Partida e motor

- **Técnico pesar mais no jogo equilibrado**: entre times de 78 e 80, escalação, funções e forma deveriam decidir mais. Hoje esses efeitos ficam em 1 a 3%. Discussão para depois do balanceamento acima.
- **Assistências**: o motor passa a escolher quem deu o passe em cada gol, para a ficha, a seleção da rodada e a artilharia.
- **Nível de dificuldade**: o fácil mostra as setas do treino e um potencial mais preciso; o difícil esconde, alarga a faixa de potencial e deixa a diretoria mais exigente.

## Carreira

- **Rever os jogos da carreira**: tocar num resultado e ver os gols no campinho, com o mesmo replay das salas. Precisa guardar a escalação de cada time no jogo, porque o elenco muda depois.
- **Ampliação do estádio**: obras em blocos de 5 mil lugares, com custo e meses de obra, e a IA ampliando devagar. Pede `npm run balance` olhando o caixa.
- **Material esportivo e naming rights** no patrocínio, além do master e dos menores.
- **Mercado**: filtro por função e "salário cabe na folha"; aviso quando abre a janela e um jogador observado está disponível; opção "parar quando um titular ficar fora" nas simulações longas.
- **Mais países, competição continental** (uma Libertadores) e **seleções**, aproveitando as datas FIFA que o calendário já reserva. O pacote e o calendário precisam mudar para uma fase de liga com mata-mata.
- **Compra de mais espaços na nuvem**: o limite por conta já existe (`entitlements`), falta a compra.
- **Liga de carreira entre amigos**: cada amigo técnico de um clube no mesmo mundo, com dinheiro e mercado. A parte grande é o `GameState` com vários técnicos (`userClubId` aparece em quase 200 lugares). O draft cobre boa parte dessa vontade.

## Draft com amigos

- **Leilão** com orçamento no lugar da serpentina.
- **Misturar pacotes** numa sala (Brasileirão + Champions), com a regra para jogadores repetidos.
- **Veto do dono** a trocas, se aparecer troca combinada para ajudar um amigo.
- **Prints ou ajuda** do draft: a página Aprenda saiu; se voltar a fazer falta, a versão enxuta (abas Em campo, Carreira e Draft, PR #97) está no histórico do git.

## Plataforma e negócio

- **Lojas de celular** (Capacitor) e **Steam** (Tauri), com a compra do passe pela loja.
- **Consulta com advogado** sobre nomes reais de clubes e jogadores antes de crescer a parte paga. O risco está descrito no histórico (plano 02, fase 11): o aviso legal ajuda, mas não autoriza o uso.
- **Reembolso** hoje é à mão, pelo painel do Mercado Pago.
