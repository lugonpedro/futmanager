import { BOARD } from '../engine/career/board.ts'
import { ECONOMY } from '../engine/finance/economy.ts'
import { SPONSOR } from '../engine/finance/sponsors.ts'
import { CLUBS_PER_DIVISION, SQUAD_SHAPE } from '../engine/generate/world.ts'
import { BENCH_SIZE, FORMATIONS } from '../engine/match/lineup.ts'
import { BALANCE, MAX_SUBSTITUTIONS, RESULT_POINTS } from '../engine/match/simulate.ts'
import { FAMILIARITY, FORM_EFFECT, POSTURE_EFFECT, STYLE_POINTS } from '../engine/match/strength.ts'
import { ROLE_SECTORS } from '../engine/match/roles.ts'
import type { LearnShot } from './learnShots.ts'
import type { Formation, Position, TacticalRole } from '../engine/model/types.ts'
import { ATTRIBUTES, FACES, KEEPER_FACES, STYLE_PLUS_FROM } from '../engine/player/attributes.ts'
import { PROGRESSION } from '../engine/progression/progression.ts'
import { TRAINING } from '../engine/progression/training.ts'
import {
  dateParts,
  fifaDates,
  MONTH_NAMES,
  seasonDates,
  transferWindows,
} from '../engine/season/calendar.ts'
import { CUP_FINAL_PRIZE, CUP_NAME, CUP_ROUNDS } from '../engine/season/cup.ts'
import { FORM_GAMES, RECOVERY_PER_DAY } from '../engine/season/form.ts'
import { PROMOTION_SPOTS } from '../engine/season/rules.ts'
import {
  CHAMPION_PRIZE,
  INJURY_DAYS,
  prizeMoney,
  YELLOWS_FOR_SUSPENSION,
} from '../engine/season/season.ts'
import { POINTS } from '../engine/season/standings.ts'
import { LOAN } from '../engine/transfer/loans.ts'
import { MARKET } from '../engine/transfer/market.ts'
import {
  CARD_CUTS,
  divisionName,
  FACE_NAMES,
  formatMoney,
  INDIVIDUAL_FOCUS_NAMES,
  INTENSITY_NAMES,
  POSITION_NAMES,
  SPONSOR_SLOT_NAMES,
  SQUAD_FOCUS_NAMES,
  STYLE_NAMES,
  TACTICAL_ROLE_NAMES,
} from './format.ts'

/*
 * The Aprenda page: how the career works. The text
 * is written here by hand, but every number comes from the engine's own
 * constants, so tuning the game never leaves the page out of date.
 */

export const CAREER_SECTIONS = [
  'comecando',
  'calendario',
  'tabela',
  'copa',
  'diretoria',
  'tatica',
  'energia',
  'cartoes',
  'jogadores',
  'evolucao',
  'treino',
  'mercado',
  'financas',
] as const

export type CareerSection = (typeof CAREER_SECTIONS)[number]

/** A place on the page another screen can link to. */
export type LearnAnchor = { tab: 'carreira'; section?: CareerSection }

export type LearnTable = { head: string[]; rows: string[][] }

/** A section: its title, the points it makes, maybe a table and a screenshot of its screen. */
export type LearnContent = { title: string; items: string[]; table?: LearnTable; shot?: LearnShot }

export const learnPath = ({ tab, section }: LearnAnchor) =>
  `/aprenda/${tab}${section ? `#${section}` : ''}`

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const num = (value: number) => decimal.format(value)

/** 1.08 → "8%", 0.9 → "10%": how far a factor is from 1. */
const percent = (factor: number) => `${Math.round(Math.abs(factor - 1) * 100)}%`

/** "a, b e c", or "a, b ou c". */
export function listText(items: readonly (string | number)[], and = 'e'): string {
  const words = items.map(String)
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} ${and} ${words.at(-1)}`
}

const monthName = (date: string) => MONTH_NAMES[dateParts(date).month - 1]

const seasonYear = 2027
const leagueRounds = 2 * (CLUBS_PER_DIVISION - 1)
const dates = seasonDates(seasonYear, leagueRounds, CUP_ROUNDS)
const windows = transferWindows(seasonYear)
const squadSize = Object.values(SQUAD_SHAPE).reduce((a, b) => a + b, 0)
const formations = Object.keys(FORMATIONS) as Formation[]
const positions = Object.keys(POSITION_NAMES) as Position[]
const positionList = listText(positions.map((p) => POSITION_NAMES[p].toLowerCase()))
const roleList = (Object.keys(ROLE_SECTORS) as TacticalRole[]).map(
  (role) => `${TACTICAL_ROLE_NAMES[role].toLowerCase()} (${role})`,
)

export const CAREER_GUIDE: Record<CareerSection, LearnContent> = {
  comecando: {
    title: 'Começando',
    shot: 'resumo',
    items: [
      'Você escolhe um clube num mundo gerado, com times e jogadores fictícios, ou no pacote Brasileirão 2026. No editor dá para mudar os nomes ou importar outro pacote.',
      `O mundo tem a ${divisionName(1)} e a ${divisionName(2)}, com ${CLUBS_PER_DIVISION} clubes cada. Os elencos começam com ${squadSize} jogadores.`,
      'Cada partida tem o seu próprio sorteio: assistir ao vivo ou simular dá o mesmo resultado.',
    ],
  },
  calendario: {
    title: 'Calendário da temporada',
    shot: 'calendario',
    items: [
      'A temporada vai de janeiro a dezembro. Janeiro é a pré-temporada.',
      `O campeonato tem ${leagueRounds} rodadas, em turno e returno, aos sábados de ${monthName(dates.league[0])} a ${monthName(dates.league.at(-1)!)}. Os primeiros sábados de ${listText(
        fifaDates(seasonYear).map((date) => monthName(date)),
        'e de',
      )} ficam livres para as datas FIFA, e entram rodadas no meio da semana onde for preciso.`,
      `A ${CUP_NAME} é jogada na quarta-feira depois das rodadas ${listText(CUP_ROUNDS)}.`,
      'Salários e patrocínio caem no dia 1º de cada mês.',
      'No Calendário, tocar num dia simula até ele; o jogo do próprio dia fica para você jogar. "Avançar até o próximo jogo" e a simulação até uma data param quando chega uma proposta por um jogador seu. "Simular até o fim da temporada" não para.',
    ],
  },
  tabela: {
    title: 'Tabela, acesso e premiação',
    shot: 'tabela',
    items: [
      `Vitória vale ${POINTS.win} pontos, empate ${POINTS.draw}.`,
      'Desempate como no Brasileirão: pontos, vitórias, saldo de gols, gols marcados, confronto direto, menos cartões vermelhos e menos amarelos.',
      `${PROMOTION_SPOTS} clubes sobem e ${PROMOTION_SPOTS} caem entre a ${divisionName(1)} e a ${divisionName(2)}.`,
      `Premiação no fim da temporada: o campeão da ${divisionName(1)} leva ${formatMoney(CHAMPION_PRIZE[1])} e o da ${divisionName(2)} ${formatMoney(CHAMPION_PRIZE[2])}. O valor cai aos poucos até o último colocado, que na ${divisionName(1)} leva ${formatMoney(prizeMoney(1, CLUBS_PER_DIVISION, CLUBS_PER_DIVISION))}.`,
      'Cada divisão tem artilheiro e craque da temporada: a melhor nota média entre quem jogou pelo menos metade das rodadas.',
    ],
  },
  copa: {
    title: CUP_NAME,
    shot: 'copa',
    items: [
      'Todos os clubes das duas séries entram, em mata-mata de jogo único.',
      'Os clubes de menor reputação jogam uma primeira fase; os maiores esperam por eles.',
      'Empate vai para os pênaltis: cinco cobranças para cada lado e, se continuar empatado, morte súbita.',
      `Cada vitória paga um prêmio: a final vale ${formatMoney(CUP_FINAL_PRIZE)} e cada fase anterior paga um pouco menos da metade da seguinte.`,
      'Lesões da copa valem para o campeonato; cartões ficam só na copa.',
    ],
  },
  diretoria: {
    title: 'Diretoria e emprego',
    shot: 'diretoria',
    items: [
      'Objetivo: a diretoria espera que você termine duas posições abaixo de onde a reputação do clube o coloca, e nunca pior do que escapar do rebaixamento.',
      `A confiança vai de 0 a 100 e começa em ${BOARD.startConfidence}. Cada vitória no campeonato dá +${BOARD.win}, cada derrota ${BOARD.loss}.`,
      `A partir da rodada ${BOARD.pressureFrom}, a tabela também pesa: mais de ${BOARD.slack} posições abaixo do objetivo custa confiança a cada rodada, e estar dentro do objetivo dá +1.`,
      `Se a confiança chega a zero, você é demitido na hora e recebe propostas de ${BOARD.offersWhenFired} clubes um pouco menores.`,
      `No fim da temporada, objetivo cumprido dá +${BOARD.targetMet}; errar custa ${BOARD.missBase}, mais ${BOARD.missPerPlace} por posição abaixo. A temporada seguinte começa com a confiança entre ${BOARD.newSeasonFloor} e ${BOARD.newSeasonCeiling}.`,
      `Fechar a temporada com ${BOARD.goodSeason} ou mais de confiança pode trazer até ${BOARD.offersWhenGood} propostas de clubes maiores.`,
    ],
  },
  tatica: {
    title: 'Escalação e tática',
    shot: 'tatica',
    items: [
      `${formations.length} formações: ${listText(formations)}. Cada vaga da formação tem uma função, que muda o quanto o jogador ajuda na defesa, no meio e no ataque: ${listText(roleList)}.`,
      'O volante protege a defesa e chuta pouco; o meia ofensivo e os pontas reforçam o ataque. A ficha do jogador mostra a função em que ele rende mais.',
      `Posições: ${positionList}. Fora da posição o jogador rende menos: ${Math.round(FAMILIARITY.secondary * 100)}% numa posição secundária dele e ${Math.round(FAMILIARITY.other * 100)}% em qualquer outra. Jogador de linha no gol é desastre. No campo, a cor da sigla avisa: verde, amarelo ou vermelho.`,
      `Postura defensiva: ${percent(POSTURE_EFFECT.defensiva.defense)} mais defesa, ${percent(POSTURE_EFFECT.defensiva.attack)} menos ataque, e o time cansa menos. Ofensiva: ${percent(POSTURE_EFFECT.ofensiva.attack)} mais ataque, ${percent(POSTURE_EFFECT.ofensiva.defense)} menos defesa, e cansa ${percent(POSTURE_EFFECT.ofensiva.tiring)} mais.`,
      `Até ${MAX_SUBSTITUTIONS} substituições, com ${BENCH_SIZE} no banco. Durante o jogo dá para mudar a formação, a postura e trocar jogadores de posição sem gastar substituição.`,
      `O mandante joga com vantagem. Atacantes rápidos contra zagueiros lentos rendem mais, principalmente no contra-ataque. Cerca de ${Math.round(BALANCE.aerialShare * 100)}% das chances vêm pelo alto, em cruzamentos, escanteios e faltas, e aí o cabeceio conta.`,
      'Em média saem uns 2,5 gols por jogo, e o mandante vence perto de 45% das vezes.',
    ],
  },
  energia: {
    title: 'Energia, forma e notas',
    shot: 'energia',
    items: [
      `A energia vai de 0 a 100 e cai durante o jogo, mais rápido em quem tem pouca resistência. Um jogador sem energia rende até 20% menos. Depois da partida ela volta ${RECOVERY_PER_DAY} pontos por dia, e até o dobro em quem tem muita resistência.`,
      `A nota de cada jogo vai de 3 a 10. Começa em 6; vitória dá +${num(RESULT_POINTS.win)}, empate +${num(RESULT_POINTS.draw)} e derrota ${num(RESULT_POINTS.loss)}. Gols, defesas e cartões mexem nela, e goleiro e defensores ganham por não sofrer gol e perdem a cada gol sofrido.`,
      `A forma vai de −2 a +2 e sai das últimas ${FORM_GAMES} notas. Cada passo vale ${num(FORM_EFFECT * 100)}% de rendimento, para mais ou para menos.`,
      'Os melhores de cada posição num 4-3-3 entram na seleção da rodada e ganham carta especial.',
    ],
  },
  cartoes: {
    title: 'Cartões e lesões',
    items: [
      `Vermelho suspende pelo próximo jogo do campeonato. ${YELLOWS_FOR_SUSPENSION} amarelos também.`,
      `Lesões tiram o jogador de ${INJURY_DAYS.min} a ${INJURY_DAYS.min + INJURY_DAYS.spread} dias; as curtas são bem mais comuns.`,
      `O treino físico aumenta o risco de lesão em ${percent(TRAINING.injury.fisico!)}; o descanso diminui em ${percent(TRAINING.injury.descanso!)}.`,
      'Quem não pode jogar o próximo jogo continua na escalação, riscado em vermelho, até você trocar. Antes do jogo, o jogo pergunta se troca por você. Para não ser perguntado, marque "Sempre trocar desfalques automaticamente" na página Time. Simular até uma data ou até o fim da temporada sempre troca sozinho.',
    ],
  },
  jogadores: {
    title: 'Jogadores e cartas',
    shot: 'jogadores',
    items: [
      `A carta mostra seis números. Jogador de linha: ${listText(FACES.map((f) => FACE_NAMES[f].name))}. Goleiro: ${listText(KEEPER_FACES.map((f) => FACE_NAMES[f].name))}. Cada um é a média de alguns dos ${ATTRIBUTES.length} atributos, que aparecem nos detalhes do jogador.`,
      'O geral depende da posição: num zagueiro conta quase só defesa e físico; num atacante, finalização, ritmo e drible.',
      `Cor da carta: bronze abaixo de ${CARD_CUTS.prata}, prata de ${CARD_CUTS.prata} a ${CARD_CUTS.ouro - 1} e ouro a partir de ${CARD_CUTS.ouro}. A seleção da rodada e o craque da temporada têm cartas próprias.`,
      `Estilos como ${listText([STYLE_NAMES.paredao, STYLE_NAMES.muralha, STYLE_NAMES.finalizador, STYLE_NAMES.velocista])} dão ${num(STYLE_POINTS)} ponto a mais no lance em que contam. A versão "+" vale o dobro e aparece quando os atributos do estilo têm média ${STYLE_PLUS_FROM} ou mais.`,
    ],
  },
  evolucao: {
    title: 'Evolução, potencial e aposentadoria',
    items: [
      'Os jogadores evoluem todo dia 1º, de maio a dezembro, e uma última vez no fechamento da temporada.',
      `Até ${PROGRESSION.youthUntil} anos crescem rápido rumo ao potencial, e mais rápido quanto mais jogam: ${PROGRESSION.fullSeason} jogos contam como uma temporada cheia, e para os mais novos cada jogo vale ${num(PROGRESSION.youthGames)}.`,
      'De 22 a 25 anos ainda crescem. De 26 a 29 ficam estáveis se jogarem mais da metade da temporada, e caem um pouco se não. De 30 a 32 perdem de 1 a 3 pontos por ano, e depois disso de 2 a 5.',
      'O potencial aparece como uma faixa, de até 7 pontos para cada lado num jovem que quase não jogou. Ela estreita a cada jogo e fica exata aos 28 anos.',
      `Jogador emprestado conta como tendo jogado pelo menos ${Math.round(PROGRESSION.loanPlaying * 100)}% da temporada.`,
      `A partir dos ${PROGRESSION.retireFrom} anos o jogador pode se aposentar; aos ${PROGRESSION.retireBy} sempre se aposenta.`,
      `Todo ano a base sobe ${PROGRESSION.youth.min} ou ${PROGRESSION.youth.max} jovens, na posição em que o elenco está mais curto.`,
    ],
  },
  treino: {
    title: 'Treino',
    shot: 'treino',
    items: [
      `Foco do elenco: ${SQUAD_FOCUS_NAMES.fisico.name.toLowerCase()}, ${SQUAD_FOCUS_NAMES.tecnico.name.toLowerCase()} ou ${SQUAD_FOCUS_NAMES.tatico.name.toLowerCase()} fazem o grupo escolhido crescer ${percent(TRAINING.groupBoost)} mais rápido. ${SQUAD_FOCUS_NAMES.descanso.name} cresce ${percent(TRAINING.restGrowth)} menos, recupera ${percent(TRAINING.restRecovery)} mais rápido e se machuca menos. ${SQUAD_FOCUS_NAMES.equilibrado.name} não acelera nada.`,
      `Plano individual, para jogadores de até ${TRAINING.individualUntil} anos que ainda crescem: um foco (${listText(
        Object.values(INDIVIDUAL_FOCUS_NAMES).map((n) => n.toLowerCase()),
        'ou',
      )}) e uma intensidade.`,
      'As setas no seletor mostram os focos que mais sobem o geral de cada jogador; o recomendado é o que sobe mais. O cartão Treino põe todos no recomendado e muda a intensidade de todos de uma vez. Para escolher um por um, use o filtro "Escolher treino" na lista do elenco ou a carta do jogador.',
      `${INTENSITY_NAMES.leve.name}, ${INTENSITY_NAMES.normal.name.toLowerCase()} e ${INTENSITY_NAMES.intenso.name.toLowerCase()} dão +${num(TRAINING.perSeason.leve)}, +${num(TRAINING.perSeason.normal)} e +${num(TRAINING.perSeason.intenso)} pontos por temporada nos atributos do plano. O intenso recupera ${percent(TRAINING.recovery.intenso)} mais devagar; o leve, ${percent(TRAINING.recovery.leve)} mais rápido.`,
    ],
  },
  mercado: {
    title: 'Mercado, contratos e empréstimos',
    shot: 'mercado',
    items: [
      `Janelas de transferência: ${listText(windows.map((w) => `o mês de ${monthName(w.from)}`))}. Jogador sem clube pode ser contratado a qualquer momento.`,
      `O elenco precisa ter de ${MARKET.minSquad} a ${MARKET.maxSquad} jogadores, com pelo menos ${MARKET.minKeepers} goleiros.`,
      `O clube pede o valor de mercado vezes ${num(MARKET.starterPremium)} por um titular e vezes ${num(MARKET.squadPremium)} por um reserva.`,
      `O jogador pede ${percent(1 + MARKET.moveRaise)} a mais de salário para mudar de clube, e mais ${percent(1 + MARKET.stepDownPremium)} por ponto de reputação que o clube novo tem a menos. Para renovar, ${percent(1 + MARKET.renewRaise)} a mais. Contratos de 1 a ${MARKET.maxContractYears} temporadas.`,
      `Para vender, coloque o jogador à venda. Com a janela aberta, ele recebe proposta em ${percent(1 + MARKET.listedBidChance)} das rodadas; sem estar à venda, só às vezes. Cada proposta vale ${MARKET.offerDays} dias.`,
      'Jogadores com contrato no fim saem quando a temporada fecha; renove antes.',
      'Na lista Contratar dá para ver só os sem clube, os com contrato no fim ou os seus favoritos, e o botão Filtros separa por idade, divisão, geral e potencial. A estrela ao lado do nome marca um jogador como favorito, seu ou de outro clube.',
      `Empréstimo: só até ${LOAN.maxAge} anos, no máximo ${LOAN.maxLoans} ao mesmo tempo e com a janela aberta. O jogador vai para um clube de uma divisão abaixo que precisa da posição dele, e esse clube paga o salário até o fim da temporada.`,
    ],
  },
  financas: {
    title: 'Finanças e patrocínio',
    shot: 'financas',
    items: [
      'Entram bilheteria nos jogos em casa, patrocínio todo dia 1º, premiações e vendas. Saem salários todo dia 1º e contratações.',
      'O público depende da reputação, da posição na tabela e do preço do ingresso. O jogo mostra um preço justo para o tamanho do clube: acima dele o público cai rápido, abaixo cresce até lotar.',
      `Patrocínio master: no começo da temporada chegam três ofertas, abertas até a primeira rodada. A segura paga ${Math.round(SPONSOR.styles.segura.monthly * 100)}% por mês e um bônus de ${SPONSOR.styles.segura.bonusMonths} meses pela meta; a equilibrada paga ${Math.round(SPONSOR.styles.equilibrada.monthly * 100)}% com bônus de ${SPONSOR.styles.equilibrada.bonusMonths} meses; a ousada paga ${Math.round(SPONSOR.styles.ousada.monthly * 100)}% com bônus de ${SPONSOR.styles.ousada.bonusMonths} meses e pede o título. Se você não escolher, a diretoria assina a segura.`,
      `Título aumenta as ofertas seguintes em ${percent(SPONSOR.champion)}, acesso em ${percent(SPONSOR.promoted)}, e rebaixamento as reduz em ${percent(SPONSOR.relegated)}. O contrato dura de 1 a ${SPONSOR.longest} temporadas e acaba antes se o clube cair ou se você trocar de clube. Sem master, o clube ainda recebe ${Math.round(SPONSOR.standIn * 100)}% do que um master pagaria, de acordos avulsos.`,
      `Patrocínios menores (${listText(Object.values(SPONSOR_SLOT_NAMES))}): todo dia 1º, de janeiro a ${MONTH_NAMES[SPONSOR.lastOfferMonth - 1]}, cada espaço vazio pode receber uma oferta, que espera ${SPONSOR.offerDays} dias pela resposta.`,
      `Um clube novo começa com uns ${ECONOMY.startingMonthsOfWages} meses de salário no caixa. Caixa negativo não demite, mas aperta: venda jogadores ou mexa no ingresso.`,
      'No fim da temporada: premiação, bônus do patrocínio, todo mundo um ano mais velho, aposentadorias, jovens da base, contratos vencidos, acesso, rebaixamento e uma tabela nova. Se foi demitido, você escolhe uma das propostas.',
    ],
  },
}
