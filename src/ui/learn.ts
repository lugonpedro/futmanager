import { PASS_DAYS } from '../cloud/mercadopago.ts'
import { CLUBS_PER_DIVISION } from '../engine/generate/world.ts'
import { BENCH_SIZE, FORMATIONS } from '../engine/match/lineup.ts'
import { MAX_SUBSTITUTIONS } from '../engine/match/simulate.ts'
import { FAMILIARITY, FORM_EFFECT, ROLE_STYLE_EFFECT } from '../engine/match/strength.ts'
import { PROGRESSION } from '../engine/progression/progression.ts'
import { PRIME } from '../engine/room/prime.ts'
import { CARDS_PER_DEAL } from '../engine/room/slots.ts'
import { ROOM_LIMITS } from '../engine/room/types.ts'
import { dateParts, MONTH_NAMES, transferWindows } from '../engine/season/calendar.ts'
import { CUP_NAME } from '../engine/season/cup.ts'
import { FORM_GAMES } from '../engine/season/form.ts'
import { PROMOTION_SPOTS } from '../engine/season/rules.ts'
import { CHAMPION_PRIZE, INJURY_DAYS, YELLOWS_FOR_SUSPENSION } from '../engine/season/season.ts'
import { POINTS } from '../engine/season/standings.ts'
import { LOAN } from '../engine/transfer/loans.ts'
import { MARKET } from '../engine/transfer/market.ts'
import { CARD_CUTS, divisionName, formatMoney, STYLE_NAMES } from './format.ts'
import { LIVE } from './liveRound.ts'
import type { LearnShot } from './learnShots.ts'

/*
 * The Aprenda page, in three tabs: what holds in both modes, then what only
 * the career has and what only the draft has. The text is written here by
 * hand and kept short (pesquisa/16-aprenda-enxuto.md: at most three points a
 * section), but every number comes from the engine's own constants, so tuning
 * the game never leaves the page out of date.
 */

export const FIELD_SECTIONS = [
  'partida',
  'escalacao',
  'funcoes',
  'cartas',
  'energia',
  'cartoes',
] as const

export const CAREER_SECTIONS = [
  'temporada',
  'competicoes',
  'diretoria',
  'desfalques',
  'treino',
  'mercado',
  'dinheiro',
] as const

export const DRAFT_SECTIONS = ['sala', 'draft', 'prime', 'rodadas', 'mercado'] as const

export type FieldSection = (typeof FIELD_SECTIONS)[number]
export type CareerSection = (typeof CAREER_SECTIONS)[number]
export type DraftSection = (typeof DRAFT_SECTIONS)[number]

export type LearnTab = 'em-campo' | 'carreira' | 'draft'

/** A place on the page another screen can link to. */
export type LearnAnchor =
  | { tab: 'em-campo'; section?: FieldSection }
  | { tab: 'carreira'; section?: CareerSection }
  | { tab: 'draft'; section?: DraftSection }

/** A section: its title, the points it makes and maybe a screenshot of its screen. */
export type LearnContent = { title: string; items: string[]; shot?: LearnShot }

/** A tab: the line that opens it, then its sections. */
export type LearnGuide<S extends string> = {
  label: string
  intro: string
  sections: readonly S[]
  content: Record<S, LearnContent>
}

export const learnPath = ({ tab, section }: LearnAnchor) =>
  `/aprenda/${tab}${section ? `#${section}` : ''}`

/**
 * Sections of the old career tab that moved, so a link saved before still
 * lands on the right place.
 */
export const MOVED_SECTIONS: Record<string, LearnAnchor> = {
  comecando: { tab: 'carreira', section: 'temporada' },
  calendario: { tab: 'carreira', section: 'temporada' },
  tabela: { tab: 'carreira', section: 'competicoes' },
  copa: { tab: 'carreira', section: 'competicoes' },
  tatica: { tab: 'em-campo', section: 'escalacao' },
  energia: { tab: 'em-campo', section: 'energia' },
  cartoes: { tab: 'em-campo', section: 'cartoes' },
  jogadores: { tab: 'em-campo', section: 'cartas' },
  evolucao: { tab: 'carreira', section: 'treino' },
  financas: { tab: 'carreira', section: 'dinheiro' },
}

const decimal = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 })
const num = (value: number) => decimal.format(value)

/** "a, b e c", or "a, b ou c". */
export function listText(items: readonly (string | number)[], and = 'e'): string {
  const words = items.map(String)
  if (words.length <= 1) return words.join('')
  return `${words.slice(0, -1).join(', ')} ${and} ${words.at(-1)}`
}

const leagueRounds = 2 * (CLUBS_PER_DIVISION - 1)
const windowMonths = transferWindows(2027).map((w) => MONTH_NAMES[dateParts(w.from).month - 1])
const pct = (factor: number) => `${Math.round(factor * 100)}%`

export const FIELD_GUIDE: LearnGuide<FieldSection> = {
  label: 'Em campo',
  intro: 'O que vale na Carreira e no Draft com amigos: a partida e os jogadores.',
  sections: FIELD_SECTIONS,
  content: {
    partida: {
      title: 'A partida',
      items: [
        'O mesmo motor joga as partidas da Carreira e do Draft. Quem joga em casa tem uma pequena vantagem.',
        'Se alguém se machuca em campo, o reserva entra sozinho.',
        'Cada partida tem o seu sorteio: assistir ou só ver o resultado dá o mesmo placar.',
      ],
    },
    escalacao: {
      title: 'Escalação e posições',
      shot: 'tatica',
      items: [
        `Escolha uma das ${Object.keys(FORMATIONS).length} formações e ponha cada jogador numa vaga. Ficam ${BENCH_SIZE} no banco.`,
        `A cor da sigla no campo diz se a vaga é dele: verde rende 100%, amarelo ${pct(FAMILIARITY.secondary)} e vermelho ${pct(FAMILIARITY.other)}.`,
        'Jogador de linha no gol é desastre.',
      ],
    },
    funcoes: {
      title: 'Funções',
      items: [
        'Cada vaga tem uma função, que muda o quanto o jogador ajuda na defesa, no meio ou no ataque. Toque num titular para trocar a função.',
        'Pontas e meias abertos também podem ir numa vaga central, para jogar aberto.',
        `A função rende mais com um estilo que combina com ela (${num(ROLE_STYLE_EFFECT * 100)}% por nível). O corta pra dentro rende mais no lado contrário ao pé bom.`,
      ],
    },
    cartas: {
      title: 'Cartas e estilos',
      shot: 'jogadores',
      items: [
        `A carta mostra 6 números, e o geral pesa os que importam para a posição. Bronze abaixo de ${CARD_CUTS.prata}, prata até ${CARD_CUTS.ouro - 1} e ouro de ${CARD_CUTS.ouro} para cima.`,
        `Estilos como ${listText([STYLE_NAMES.paredao, STYLE_NAMES.finalizador, STYLE_NAMES.velocista])} dão um bônus no lance em que contam, e o "+" vale o dobro. Os melhores jogadores sempre têm pelo menos um.`,
        'O jogador ganha estilos pelos atributos e nunca perde um; com a idade, o "+" pode virar o normal.',
      ],
    },
    energia: {
      title: 'Energia, nota e forma',
      shot: 'energia',
      items: [
        'A energia cai durante o jogo e volta com os dias. Cansado, o jogador rende até 20% menos.',
        `A nota do jogo vai de 3 a 10. A forma sai das últimas ${FORM_GAMES} notas e mexe ${num(FORM_EFFECT * 100)}% no rendimento por passo.`,
        'Os melhores de cada posição entram na seleção da rodada.',
      ],
    },
    cartoes: {
      title: 'Cartões e lesões',
      items: [
        `Vermelho suspende o próximo jogo; ${YELLOWS_FOR_SUSPENSION} amarelos também.`,
        `Lesão tira de ${INJURY_DAYS.min} a ${INJURY_DAYS.min + INJURY_DAYS.spread} dias, e as curtas são as mais comuns.`,
        'Quem está fora aparece riscado em vermelho na escalação até você trocar.',
      ],
    },
  },
}

export const CAREER_GUIDE: LearnGuide<CareerSection> = {
  label: 'Carreira',
  intro:
    'Tudo da aba Em campo vale aqui. Você comanda um clube por várias temporadas: monta o elenco, cuida do dinheiro e responde à diretoria.',
  sections: CAREER_SECTIONS,
  content: {
    temporada: {
      title: 'Temporada',
      shot: 'calendario',
      items: [
        `Janeiro é a pré-temporada. O campeonato tem ${leagueRounds} rodadas, e a ${CUP_NAME} é jogada às quartas.`,
        'No Calendário, toque num dia para simular até ele. Avançar para quando chega uma proposta por um jogador seu.',
        `Durante o jogo você faz até ${MAX_SUBSTITUTIONS} substituições e pode mudar a formação.`,
      ],
    },
    competicoes: {
      title: 'Competições',
      shot: 'tabela',
      items: [
        `Vitória vale ${POINTS.win} pontos, empate ${POINTS.draw}. ${PROMOTION_SPOTS} sobem e ${PROMOTION_SPOTS} caem entre a ${divisionName(1)} e a ${divisionName(2)}.`,
        `A ${CUP_NAME} é mata-mata de jogo único com as duas séries, e empate vai para os pênaltis.`,
        `A posição na tabela e cada fase da copa pagam prêmio. O campeão da ${divisionName(1)} leva ${formatMoney(CHAMPION_PRIZE[1])}.`,
      ],
    },
    diretoria: {
      title: 'Diretoria',
      shot: 'diretoria',
      items: [
        'A diretoria espera uma posição na tabela, que aparece no Resumo como objetivo.',
        'Vitória sobe a confiança e derrota desce. Se ela chegar a zero, você é demitido e escolhe outro clube.',
        'Fechar bem a temporada pode trazer propostas de clubes maiores.',
      ],
    },
    desfalques: {
      title: 'Desfalques',
      items: [
        'Antes do jogo, o jogo pergunta se troca por você quem não pode jogar.',
        'Marque "Sempre trocar desfalques automaticamente" na página Time para não ser perguntado.',
      ],
    },
    treino: {
      title: 'Treino e evolução',
      shot: 'treino',
      items: [
        'Escolha o foco do elenco e um plano para cada jovem. As setas mostram o foco que mais sobe o geral, e o cartão Treino põe todos no recomendado.',
        `Até ${PROGRESSION.youthUntil} anos crescem rápido, e mais ainda jogando. Dos 30 em diante caem. O potencial é uma faixa que estreita com os jogos.`,
        `A partir dos ${PROGRESSION.retireFrom} anos podem se aposentar. A base sobe ${PROGRESSION.youth.min} ou ${PROGRESSION.youth.max} jovens por ano.`,
      ],
    },
    mercado: {
      title: 'Mercado',
      shot: 'mercado',
      items: [
        `Contrate em ${listText(windowMonths)}; jogador sem clube, a qualquer hora. O elenco tem de ${MARKET.minSquad} a ${MARKET.maxSquad} jogadores, com ${MARKET.minKeepers} goleiros.`,
        `Para vender, ponha o jogador à venda e espere propostas; cada uma vale ${MARKET.offerDays} dias.`,
        `Renove antes do fim do contrato. Empréstimo só até ${LOAN.maxAge} anos.`,
      ],
    },
    dinheiro: {
      title: 'Dinheiro',
      shot: 'financas',
      items: [
        'Entram bilheteria, patrocínio e prêmios. Os salários saem todo dia 1º.',
        'No começo da temporada, escolha a oferta de patrocínio master: segura, equilibrada ou ousada, que paga menos por mês e mais pela meta.',
        'Ingresso caro esvazia o estádio; o jogo mostra o preço justo.',
      ],
    },
  },
}

export const DRAFT_GUIDE: LearnGuide<DraftSection> = {
  label: 'Draft',
  intro:
    'Tudo da aba Em campo vale aqui. Você e os amigos montam times escolhendo cartas e jogam uma liga entre vocês, sem dinheiro, treino, idade nem contratos.',
  sections: DRAFT_SECTIONS,
  content: {
    sala: {
      title: 'A sala',
      shot: 'sala',
      items: [
        `Criar uma sala pede o passe de ${PASS_DAYS} dias; entrar pelo convite é grátis.`,
        `De ${ROOM_LIMITS.minTeams} a ${ROOM_LIMITS.maxTeams} times. Vagas sem dono viram robôs, que escolhem e escalam sozinhos.`,
        'Quem cria escolhe o tamanho do elenco, o tempo por escolha, os turnos, as lesões e as trocas.',
      ],
    },
    draft: {
      title: 'O draft',
      shot: 'cartas',
      items: [
        `Escolha a formação antes da primeira carta: ela decide as suas vagas. Toque numa vaga vazia para abrir ${CARDS_PER_DEAL} cartas daquela posição e fique com uma.`,
        'Depois dos 11 titulares vêm as reservas por setor: goleiro, defensor (zagueiro ou lateral), meia e atacante, e de novo.',
        'Se o tempo acabar, fica a melhor carta. A ordem vai e volta a cada volta.',
      ],
    },
    prime: {
      title: 'Cartas prime',
      shot: 'prime',
      items: [
        `De vez em quando uma das ${CARDS_PER_DEAL} cartas sai prime, roxa, com ${PRIME.boost[0]} a ${PRIME.boost[1]} de geral a mais.`,
        `Ela vale só naquela sala e nunca passa de ${PRIME.ceiling}.`,
      ],
    },
    rodadas: {
      title: 'As rodadas',
      shot: 'rodada',
      items: [
        'Escale e marque Pronto. A rodada é jogada quando todos marcam, e o dono pode jogar sem esperar.',
        'Quem não marcou joga com a última escalação, sem os desfalques.',
        `Todos assistem à rodada ao vivo, juntos. Se todos tocarem em Acelerar, ela corre ${LIVE.fastFactor} vezes mais rápido.`,
      ],
    },
    mercado: {
      title: 'Mercado da sala',
      shot: 'mercado-sala',
      items: [
        `Peça até ${ROOM_LIMITS.claimsPerRound} jogadores livres por rodada; quem está pior na tabela é atendido primeiro. Quem você dispensa só pode ser pedido a partir da rodada seguinte.`,
        `Troque de 1 a ${ROOM_LIMITS.maxTradePlayers} jogadores com um amigo, o mesmo número de cada lado. Use Comparar para ver as cartas lado a lado antes de aceitar.`,
        `Todo elenco precisa manter ${ROOM_LIMITS.minKeepers} goleiros.`,
      ],
    },
  },
}

export const LEARN_TABS = {
  'em-campo': FIELD_GUIDE,
  carreira: CAREER_GUIDE,
  draft: DRAFT_GUIDE,
} satisfies Record<LearnTab, LearnGuide<string>>
