import { CSV_HEADER } from '../engine/pack/file.ts'
import { SQUAD_SHAPE } from '../engine/generate/world.ts'

const shape = Object.entries(SQUAD_SHAPE)
  .map(([position, count]) => `${count} ${position}`)
  .join(', ')

/**
 * A prompt the player can paste into an AI assistant with web search to put
 * together a pack of real squads. It asks for sources and blanks instead of
 * guesses, so made-up players stay out.
 */
export const AI_PACK_PROMPT = `Monte um pacote de dados para o jogo onzemestre com os clubes e elencos do Campeonato Brasileiro, Série A e Série B, na temporada [ANO], com os elencos como estão em [DATA, por exemplo "início de abril"].

Regras para não inventar nada:
1. Use busca na internet e consulte fontes atuais: o site oficial da CBF para saber quais clubes estão em cada série nessa temporada e o site oficial de cada clube (ou outra fonte confiável e recente) para os elencos. Se você não consegue pesquisar na internet, diga isso e pare, sem responder de memória.
2. Só coloque um jogador se encontrou numa fonte que ele está no elenco nessa data. Na dúvida, deixe de fora. É melhor um clube com menos jogadores do que um nome inventado ou desatualizado.
3. Use o nome esportivo do jogador (o que aparece na camisa e na imprensa), sem repetir o mesmo jogador em dois clubes.
4. Deixe as colunas idade e overall em branco. O jogo calcula a força pelo tamanho do clube.
5. Não inclua escudos, imagens ou links dentro da planilha.

Formato da resposta: primeiro, um bloco de código com uma planilha CSV separada por ponto e vírgula, com exatamente este cabeçalho:
${CSV_HEADER.join(';')}

- ordem: de 1 a 40. Os clubes 1 a 20 são a Série A e os 21 a 40, a Série B. Dentro de cada série, ordene do mais forte para o mais fraco, usando a classificação da temporada anterior (os que subiram ficam no fim da Série A e os que caíram, no começo da Série B).
- clube, sigla (3 letras), cidade, cor1 e cor2 (as duas cores principais em hexadecimal, como #c8102e) aparecem só na primeira linha de cada clube; nas linhas seguintes do mesmo clube, deixe ordem e esses campos vazios.
- Uma linha por jogador, com jogador e posicao. Posição só pode ser G (goleiro), Z (zagueiro), L (lateral), M (meio-campo) ou A (atacante).
- No máximo 25 jogadores por clube, de preferência ${shape}.

Depois do bloco de código:
- As fontes que você usou para cada clube, com a data de cada uma.
- O que não conseguiu confirmar.
- Uma conferência: quantos clubes tem cada série (precisam ser 20 e 20) e se algum jogador aparece duas vezes.`
