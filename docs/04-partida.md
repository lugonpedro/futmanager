# Tela de partida

Parte da etapa M6 de [03-melhorias.md](03-melhorias.md). Junta as mudanças pedidas para `/jogo/partida`, a partida ao vivo do usuário. Nenhuma delas muda o resultado das partidas nem o formato do save: o motor (`src/engine/match/simulate.ts`) continua sorteando os mesmos lances com a mesma semente.

## Ordem proposta

| Passo | O que entrega                                              | Tamanho |
| ----- | ---------------------------------------------------------- | ------- |
| P1    | Tela só com o seu jogo; velocidades Normal e Rápido        | Pequeno |
| P2    | Estatísticas ao vivo: posse, finalizações, notas           | Médio   |
| P3    | Uniformes que não se confundem, no campo e no placar       | Pequeno |
| P4    | Times trocam de lado no segundo tempo                      | Pequeno |
| P5    | Bola que corre sozinha: passes, chutes e defesas           | Médio   |
| P6    | "Seu time": trocar jogadores de posição, não só substituir | Médio   |

P3, P4 e P5 são o campo 2D e podem ir num PR só. P1 e P2 também cabem juntos.

---

## P1: Só o seu jogo e duas velocidades

- Sai o placar dos outros jogos da rodada (hoje a tela simula a rodada inteira e lista os resultados ao lado). Os outros jogos continuam sendo simulados por trás, para a tabela, mas só aparecem na Visão geral depois da partida.
- A velocidade passa a ter só **Normal** e **Rápido**. "Lento" sai.
- O espaço que sobra vai para as estatísticas do P2.

## P2: Estatísticas ao vivo

O motor já conta posse, finalizações, finalizações no alvo e cartões para cada time (`TeamStats`) e já dá uma nota de 3 a 10 para cada jogador no fim do jogo (`ratings`). O que falta é mostrar isso durante a partida.

- **Painel de estatísticas** com barras lado a lado: posse de bola (%), finalizações, finalizações no alvo, faltas e cartões. As faltas o motor já sorteia como final de lance, só não soma; a contagem entra sem mudar o sorteio.
- **Notas dos jogadores** dos dois times, atualizadas a cada lance: começam em 6 e mudam com o placar, os gols, as defesas, os cartões e os gols sofridos, como a nota final de hoje. A nota final continua a mesma de hoje; a parcial é o mesmo cálculo sem a pitada de sorte do fim.
- Destaque para o melhor em campo no apito final.

## P3: Uniformes que não se confundem

Hoje o visitante troca para a segunda cor quando as cores principais são parecidas (`kits` em `MatchPitch.tsx`), mas:

- o limite de "parecido" é baixo, e cores próximas como vermelho e vinho passam como diferentes;
- o placar e a lista de lances usam a cor do clube, não o uniforme que está em campo, e aí o placar diz uma coisa e o campo outra.

A proposta:

- Calcular a diferença entre cores pela percepção (distância de cor que leva em conta como o olho vê) e com um limite mais alto.
- Se a segunda cor do visitante também for parecida, usar um terceiro uniforme: branco, preto ou cinza, o que contrastar mais.
- **Placar, lances e estatísticas usam o uniforme da partida.** Cada time ganha um quadradinho com a cor da camisa ao lado do nome.
- O goleiro de cada time usa uma cor própria (amarelo, verde-limão ou laranja), diferente dos dois times.

## P4: Troca de lado no intervalo

Hoje o mandante ataca sempre para a direita. No segundo tempo os dois times passam a atacar para o lado oposto. Na prática é inverter o espelho (`mirror` em `pitchScene.ts`) a partir do minuto 46, e mostrar a troca no intervalo.

## P5: Bola que corre

Hoje a bola segue o caminho do lance colada no jogador, que vai driblando até dentro do gol.

A proposta separa a **bola** de quem a conduz:

- **Passe**: a bola sai do pé de um jogador e viaja até o próximo do mesmo time, mais rápido que um jogador correndo. Quem recebe vai ao encontro da bola.
- **Chute**: o jogador para na entrada da área ou onde a jogada chegou, e só a bola segue para o gol, rápida, com uma leve curva.
  - **Gol**: a bola entra e para na rede.
  - **Defesa**: o goleiro se desloca para a bola, e ela fica com ele ou é rebatida para escanteio.
  - **Para fora**: a bola passa ao lado da trave e sai do campo.
- **Desarme**: a bola muda de dono no meio do caminho e o outro time sai jogando.

Tudo isso continua sendo desenhado a partir do mesmo lance que o motor já sorteia (lado, corredor, profundidade e final). Muda só a animação, não quem marca.

## P6: Mexer no time durante o jogo

Hoje o menu "Seu time" permite trocar formação, postura e fazer substituições. Não dá para trocar dois jogadores de lugar, como inverter os atacantes ou passar um meia para a lateral.

- Tocar num titular e depois em outro **troca os dois de posição**, sem gastar substituição.
- No campo, isso já muda o desenho (quem joga pela direita e quem joga pela esquerda).
- No motor, a troca conta quando muda a posição do jogador (meia jogando de lateral rende menos, como já acontece na escalação). Trocar dois atacantes entre si só muda o lado em que cada um aparece, porque as posições hoje não distinguem direita e esquerda.
- O mesmo gesto também passa a funcionar na página Time, antes do jogo.

## Decisões

Confirmadas em outubro de 2026:

1. **Outros jogos**: somem de vez da tela de partida.
2. **Notas ao vivo**: aparecem para os dois times.
