# 17 · Balanceamento das partidas

Pergunta do Lugon (22/10/2026): um time de média 90 ganha a maioria contra um de média 60/70? No draft com os amigos, todo mundo tinha chance real de ser campeão e mexer no elenco parecia não mudar nada.

Resposta curta: o motor hoje é **achatado demais**. Uma diferença de 30 pontos de geral rende só 70% de vitórias, e a 10 pontos o favorito vence só metade dos jogos. No draft piora, porque os times saem muito parecidos e a liga tem só 14 rodadas.

## De onde vem a aleatoriedade

A partida é decidida minuto a minuto em `src/engine/match/simulate.ts`:

1. **Posse do minuto**: sorteio ponderado pelo meio-campo. A vantagem vira um multiplicador `exp(diferença / strengthScale)`, com `strengthScale = 115`. Com 30 pontos a mais no meio, o favorito fica com só 56% da bola.
2. **Chance de finalização**: 25% por minuto com a bola, vezes `vantagem^0.7` (ataque contra a defesa adversária). Com 30 pontos, isso é só 1,2× a mais.
3. **No alvo** (40% × `vantagem^0.3`) e **gol** (27% × `vantagem^0.3` × finalizador contra goleiro).
4. Ruído secundário: cansaço com sorteio, cartões, lesões.

O problema não é ter sorte (futebol tem, com ~2,5 gols por jogo é inevitável). É que o `strengthScale = 115` transforma diferenças grandes de qualidade em vantagens pequenas: 30 pontos viram só 1,30×. O mando de campo (`homeAdvantage = 9`) vale tanto quanto 9 pontos de geral no time todo.

## O que medi

Times sintéticos de média exata (titulares), 4 elencos por nível, 4.000 jogos por confronto, mando alternado.

| Forte x fraco | Hoje (V/E/D) | Proposta A (V/E/D) |
| ------------- | ------------ | ------------------ |
| 90 x 60       | 70 / 18 / 11 | 84 / 11 / 5        |
| 90 x 70       | 61 / 23 / 17 | 73 / 18 / 9        |
| 80 x 70       | 51 / 25 / 25 | 54 / 24 / 21       |
| 80 x 75       | 44 / 27 / 29 | 46 / 26 / 28       |
| 78 x 75       | 39 / 27 / 34 | 42 / 27 / 31       |

Proposta A = `strengthScale 70`, `homeAdvantage 5.5`, `conversion 0.26`. Também testei `strengthScale 55` e 45: com 55, 90 x 60 vai a 92% de vitórias, mas o jogo passa de 3,9 gols e a Série A fica com média de gols acima de 2,8.

### Liga de 8 times, 2 turnos (formato do draft)

600 ligas simuladas, titulares com médias de 83 até 76 (um ponto entre cada).

| Média       | Títulos hoje | Títulos com A | Títulos com 55 |
| ----------- | ------------ | ------------- | -------------- |
| 83 (melhor) | 19%          | 26%           | 26%            |
| 80          | 13%          | 12%           | 12%            |
| 76 (pior)   | 9%           | 4%            | 2%             |

Sorteio puro seria 12,5% para cada. Hoje o melhor time da sala é campeão quase tão pouco quanto o pior.

Com os times mais próximos (de 83 a 79,5, meio ponto entre cada), nenhum ajuste muda muito: o melhor sai de 17% para 18–19%.

### Salas de draft no automático (`npm run room`)

300 salas com todos os times no automático: a diferença média entre os titulares mais forte e mais fraco da sala é de **0,6 ponto de geral**. Ou seja, o draft em serpentina já iguala muito os elencos; o título vira loteria (cada posição no ranking de força ganha 10–14%). Humanos escolhem diferente dos robôs, então a diferença real é maior, mas dificilmente passa de 3–5 pontos.

### Modo carreira (mundo gerado, Série A de 92 a 50 de média)

|                                  | Hoje        | Proposta A   |
| -------------------------------- | ----------- | ------------ |
| Melhor x pior da Série A (V/E/D) | 83 / 12 / 5 | 94 / 6 / 0,8 |
| Gols por jogo, Série A / B       | 2,58 / 2,51 | 2,76 / 2,69  |
| Mandante vence, Série A / B      | 43% / 46%   | 49% / 45%    |
| Empates, Série A / B             | 23% / 26%   | 20% / 19%    |

Com a Proposta A, todos os testes passam menos um: `lets the stronger side win more, without making upsets impossible` exige que o pior da Série A vença o melhor em mais de 4% dos jogos. Com uma diferença de 42 pontos, 0,5–1% é mais realista. O teste teria que passar a pedir algo como "mais de 0,5%".

## Propostas

**A. Deixar a força pesar mais (recomendada).** `strengthScale 115 → 70`, `homeAdvantage 9 → 5.5` (para o mando seguir valendo ~45% de vitórias), `conversion 0.27 → 0.26` (para segurar os gols). Ajustar o teste das zebras. É uma mudança de três números, só no motor, sem mexer no save. Efeito: 90 x 60 passa de 70% para 84% de vitórias, e o melhor time de uma liga curta passa de 19% para 26% de títulos. Efeito colateral: um pouco menos de empates (de 23–26% para 19–20%) e uns 0,15 gols a mais por jogo; dá para calibrar no PR.

**B. Liga do draft mais longa.** Hoje são 2 turnos (14 rodadas com 8 times). Com 4 turnos, a sorte de cada jogo se dilui. Pode virar uma opção da sala ("turnos: 2 / 3 / 4"). Não mexe no motor.

**C. Fazer o técnico importar mais no jogo próximo.** Entre times de 78 e 80, o que decide deveria ser escalação, funções, postura e entrosamento, não o geral. Hoje esses efeitos são de 1–3% (por exemplo `ROLE_STYLE_EFFECT 0.015`, `FORM_EFFECT 0.015`). É uma discussão maior, para depois de A.

O que **não** recomendo: tirar a aleatoriedade dos gols. Com ~2,5 gols por jogo, jogos entre times parecidos sempre vão ficar perto de 45/27/28; é assim no futebol real também.

## O que entrou

O Lugon escolheu a proposta A junto com a B:

- `strengthScale 70`, `homeAdvantage 5.5`, `conversion 0.26` em `BALANCE`. O teste das zebras passa a pedir que o pior da Série A vença o melhor em mais de 0,3% dos jogos (dá 0,7% com a semente do teste).
- A sala do draft volta a oferecer três turnos e ganha quatro. Do terceiro turno em diante, a tabela repete os dois primeiros, com o mesmo mando. Uma migração aceita `legs` até 4.

## Proposta C: o técnico pesa mais (entrou depois)

Times idênticos de média 79 (6 elencos, o mesmo elenco dos dois lados) e 4.000 jogos por linha, mando alternado. Só muda o que o técnico controla.

| Cenário (V/E/D do lado cuidado)                   | Antes        | Depois           |
| ------------------------------------------------- | ------------ | ---------------- |
| Forma +2 x forma 0                                | 41 / 27 / 31 | 44 / 26 / 29     |
| Forma +2 x forma -2                               | 44 / 28 / 29 | 53 / 24 / 23     |
| Funções escolhidas pelos estilos x funções padrão | 39 / 26 / 35 | 45 / 24 / 31     |
| Descansado x cansado (energia 75)                 | 45 / 27 / 29 | igual            |
| **Time de 78 bem cuidado x time de 80 largado**   | 41 / 26 / 33 | **49 / 24 / 27** |

O time de 78 bem cuidado tem funções escolhidas pelos estilos e forma +1; o de 80 largado tem funções padrão e forma -1. Sem ninguém mexer, 80 x 78 dá 40 / 28 / 33.

Mudou em `src/engine/match/strength.ts`:

- `FORM_EFFECT 0.015 → 0.03`: cada passo de forma vale 3%, e um time em forma +2 rende 6% a mais que um em forma 0. Escalar quem está bem e poupar quem está mal passa a contar.
- `ROLE_STYLE_EFFECT 0.015 → 0.04`: cada nível de estilo que combina com a função escolhida vale 4%. Um meia com lançador jogando de regista, por exemplo, ganha 4% (8% com o "+").
- `INSIDE_FOOT_EFFECT 0.03 → 0.05`: o corta pra dentro no lado certo ganha 5% e, no lado errado, perde 5%.

Testei também deixar mais duro jogar fora de posição (`FAMILIARITY` de 0,97/0,92 para 0,95/0,85). Isso não mudou nada que desse para medir, porque os atributos já derrubam o jogador fora da posição dele, então ficou como estava. O cansaço também ficou como estava: rodar o elenco já vale tanto quanto forma +2.

Um risco a acompanhar: a forma vem das notas, e as notas sobem quando o time vence. Com a forma valendo o dobro, um time embalado tende a continuar embalado. Os testes de balanço do modo carreira continuam passando.

## Como reproduzir

`npm run balance:match` imprime a tabela de confrontos (2.000 jogos cada; `-- 4000` para mais). `npm run room` mostra o lado do draft.
