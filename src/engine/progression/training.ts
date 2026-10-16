import type { Attribute, GameState, IndividualFocus, SquadFocus, Training } from '../model/types.ts'

/**
 * Training knobs. The squad's focus speeds up one group of attributes, or
 * rests the players: slower growth, quicker recovery, fewer injuries. Heavy
 * physical work brings more injuries.
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
  /** Points each focused attribute gains over a season, on top of the rest, while he still grows. */
  individualPerSeason: 3.5,
  /** Players with a focus of their own, at most. */
  maxIndividual: 5,
  /** No extra gain past this age. */
  individualUntil: 31,
}

export const NO_TRAINING: Training = { focus: 'equilibrado', individual: {} }

/** The attributes each individual focus works on. */
export const FOCUS_ATTRIBUTES: Record<IndividualFocus, Attribute[]> = {
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

/** How fast a player recovers between matches: quicker for the user's players while resting. */
export function recoveryRate(game: GameState, playerId: string): number {
  return game.training.focus === 'descanso' && isUsers(game, playerId) ? TRAINING.restRecovery : 1
}

/** Injury chance in the user's matches against the usual. */
export const injuryRisk = (training: Training) => TRAINING.injury[training.focus] ?? 1

export function setSquadFocus(game: GameState, focus: SquadFocus): GameState {
  return { ...game, training: { ...game.training, focus } }
}

/**
 * Gives one of the user's players a focus of his own, or takes it away with
 * undefined. Returns the game unchanged past the limit of five.
 */
export function setIndividualFocus(
  game: GameState,
  playerId: string,
  focus: IndividualFocus | undefined,
): GameState {
  const individual = { ...game.training.individual }
  if (focus === undefined) delete individual[playerId]
  else if (
    !isUsers(game, playerId) ||
    (individual[playerId] === undefined && Object.keys(individual).length >= TRAINING.maxIndividual)
  ) {
    return game
  } else individual[playerId] = focus
  return { ...game, training: { ...game.training, individual } }
}

/** Individual focus of players who are no longer the user's, dropped. */
export function keepOwnFocus(game: GameState): GameState {
  const individual = Object.fromEntries(
    Object.entries(game.training.individual).filter(([id]) => isUsers(game, id)),
  )
  return { ...game, training: { ...game.training, individual } }
}
