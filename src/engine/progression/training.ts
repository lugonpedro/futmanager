import type {
  Attribute,
  GameState,
  IndividualFocus,
  Player,
  SquadFocus,
  Training,
  TrainingIntensity,
  TrainingPlan,
} from '../model/types.ts'

/**
 * Training knobs. The squad's focus speeds up one group of attributes, or
 * rests the players: slower growth, quicker recovery, fewer injuries. Heavy
 * physical work brings more injuries. On top of it each player who can
 * still grow may get a plan of his own: what to work on and how hard.
 */
export const TRAINING = {
  /** Growth of the focused group, against 1 for the others. */
  groupBoost: 1.35,
  /** Growth while resting. */
  restGrowth: 0.85,
  /** Recovery between matches while resting. */
  restRecovery: 1.3,
  /** Injury chance in matches, by focus; 1 when missing. */
  injury: { fisico: 1.2, descanso: 0.8 } as Partial<Record<SquadFocus, number>>,
  /**
   * Points each attribute of a player's plan gains over a season, on top of
   * the rest, by intensity, while he still grows.
   */
  perSeason: { leve: 2, normal: 3.5, intenso: 5 } as Record<TrainingIntensity, number>,
  /** Recovery between matches against the usual, by intensity. */
  recovery: { leve: 1.15, normal: 1, intenso: 0.8 } as Record<TrainingIntensity, number>,
  /** Oldest a player can be, today, and still gain from a plan of his own. */
  individualUntil: 30,
  /** Attributes a general plan works on: the ones that count most for his position. */
  generalAttributes: 5,
}

export const NO_TRAINING: Training = { focus: 'equilibrado', individual: {} }

/** The attributes each individual focus works on; a general plan depends on the position. */
export const FOCUS_ATTRIBUTES: Record<Exclude<IndividualFocus, 'geral'>, Attribute[]> = {
  finalizacao: ['finishing', 'shotPower', 'attackPositioning'],
  passe: ['shortPassing', 'longPassing', 'vision'],
  drible: ['dribbling', 'ballControl', 'agility'],
  cruzamento: ['crossing', 'longPassing'],
  defesa: ['marking', 'tackling', 'interceptions'],
  cabeceio: ['heading', 'jumping', 'strength'],
  velocidade: ['acceleration', 'sprintSpeed'],
  goleiro: ['diving', 'handling', 'reflexes', 'keeperPositioning'],
}

/** The group each squad focus speeds up. */
export const FOCUS_GROUP: Partial<Record<SquadFocus, 'physical' | 'technical' | 'mental'>> = {
  fisico: 'physical',
  tecnico: 'technical',
  tatico: 'mental',
}

const isUsers = (game: GameState, playerId: string) =>
  game.world.players[playerId]?.clubId === game.userClubId

/** Why a player can't train on his own, if he can't: he is at his ceiling, or too old. */
export function trainingBlock(player: Player): 'potencial' | 'idade' | undefined {
  if (player.age > TRAINING.individualUntil) return 'idade'
  if (player.overall >= player.potential) return 'potencial'
  return undefined
}

export const canTrain = (player: Player) => trainingBlock(player) === undefined

/**
 * How fast a player recovers between matches: quicker for the user's players
 * while the squad rests, and as his own plan's intensity says.
 */
export function recoveryRate(game: GameState, playerId: string): number {
  if (!isUsers(game, playerId)) return 1
  const rest = game.training.focus === 'descanso' ? TRAINING.restRecovery : 1
  const plan = game.training.individual[playerId]
  return rest * (plan ? TRAINING.recovery[plan.intensity] : 1)
}

/** Injury chance in the user's matches against the usual. */
export const injuryRisk = (training: Training) => TRAINING.injury[training.focus] ?? 1

export function setSquadFocus(game: GameState, focus: SquadFocus): GameState {
  return { ...game, training: { ...game.training, focus } }
}

/** A sensible first plan: work on what counts for his position, at the usual pace. */
export const FIRST_PLAN: TrainingPlan = { focus: 'geral', intensity: 'normal' }

/**
 * Gives one of the user's players a plan of his own, or takes it away with
 * undefined. Returns the game unchanged for someone else's player, or one who
 * can no longer grow.
 */
export function setTrainingPlan(
  game: GameState,
  playerId: string,
  plan: TrainingPlan | undefined,
): GameState {
  const individual = { ...game.training.individual }
  if (plan === undefined) delete individual[playerId]
  else if (!isUsers(game, playerId) || !canTrain(game.world.players[playerId])) return game
  else individual[playerId] = plan
  return { ...game, training: { ...game.training, individual } }
}

/** The same plan for every one of the user's players who can still grow, or none for anyone. */
export function setSquadPlans(game: GameState, plan: TrainingPlan | undefined): GameState {
  const ids = game.world.clubs[game.userClubId].playerIds
  const individual = plan
    ? Object.fromEntries(
        ids.filter((id) => canTrain(game.world.players[id])).map((id) => [id, plan]),
      )
    : {}
  return { ...game, training: { ...game.training, individual } }
}

/** Every plan of the user's players at one intensity; who has no plan still has none. */
export function setSquadIntensity(game: GameState, intensity: TrainingIntensity): GameState {
  const individual = Object.fromEntries(
    Object.entries(game.training.individual).map(([id, plan]) => [id, { ...plan, intensity }]),
  )
  return { ...game, training: { ...game.training, individual } }
}

/** The intensity all plans share, or undefined when there are none or they differ. */
export function squadIntensity(training: Training): TrainingIntensity | undefined {
  const intensities = new Set(Object.values(training.individual).map((p) => p.intensity))
  return intensities.size === 1 ? [...intensities][0] : undefined
}

/** Plans of players who are no longer the user's, or who can no longer grow, dropped. */
export function keepOwnFocus(game: GameState): GameState {
  const individual = Object.fromEntries(
    Object.entries(game.training.individual).filter(
      ([id]) => isUsers(game, id) && canTrain(game.world.players[id]),
    ),
  )
  return { ...game, training: { ...game.training, individual } }
}
