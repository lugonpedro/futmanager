import { describe, expect, it } from 'vitest'
import type { GameState } from '../model/types.ts'
import { createRng } from '../rng.ts'
import { conditionOn } from '../season/form.ts'
import { isSeasonOver, newGame, playRound, startNextSeason } from '../season/season.ts'
import {
  developStep,
  developWorld,
  focusGains,
  keyAttributes,
  PROGRESSION,
  recommendedFocus,
  setRecommendedPlans,
} from './progression.ts'
import {
  canTrain,
  FIRST_PLAN,
  FOCUS_ATTRIBUTES,
  injuryRisk,
  keepOwnFocus,
  NO_TRAINING,
  recoveryRate,
  setSquadFocus,
  setSquadPlans,
  setTrainingPlan,
  TRAINING,
  trainingBlock,
} from './training.ts'

const game = newGame(3, 'C5')
const squad = game.world.clubs.C5.playerIds
const trainable = squad.filter((id) => canTrain(game.world.players[id]))
const young = squad
  .map((id) => game.world.players[id])
  .filter((p) => p.age <= 21 && p.potential > p.overall + 5)

/** The board happy whatever the results, so the manager stays on. */
const pleased = (g: GameState): GameState => ({
  ...g,
  career: { ...g.career, status: 'empregado', target: 20, confidence: 80 },
})

describe('training', () => {
  it('starts balanced, with nobody on a focus of his own', () => {
    expect(game.training).toEqual(NO_TRAINING)
  })

  it('gives any of the user’s players who can still grow a plan of his own', () => {
    let next = game
    for (const id of trainable) next = setTrainingPlan(next, id, FIRST_PLAN)
    expect(Object.keys(next.training.individual)).toEqual(trainable)
    next = setTrainingPlan(next, trainable[0], { focus: 'drible', intensity: 'intenso' })
    expect(next.training.individual[trainable[0]]).toEqual({
      focus: 'drible',
      intensity: 'intenso',
    })
    next = setTrainingPlan(next, trainable[0], undefined)
    expect(next.training.individual[trainable[0]]).toBeUndefined()
    const other = game.world.clubs.C1.playerIds[0]
    expect(setTrainingPlan(game, other, FIRST_PLAN)).toBe(game)
    expect(Object.keys(setSquadPlans(game, FIRST_PLAN).training.individual)).toEqual(trainable)
    expect(setSquadPlans(next, undefined).training.individual).toEqual({})
  })

  it('turns away players at their ceiling or past 30', () => {
    const player = game.world.players[trainable[0]]
    const capped = { ...player, potential: player.overall }
    const old = { ...player, age: TRAINING.individualUntil + 1 }
    expect(trainingBlock(player)).toBeUndefined()
    expect(trainingBlock(capped)).toBe('potencial')
    expect(trainingBlock(old)).toBe('idade')
    expect(trainingBlock({ ...player, age: TRAINING.individualUntil })).toBeUndefined()
    for (const changed of [capped, old]) {
      const g = {
        ...game,
        world: { ...game.world, players: { ...game.world.players, [player.id]: changed } },
      }
      expect(setTrainingPlan(g, player.id, FIRST_PLAN)).toBe(g)
      expect(Object.keys(setSquadPlans(g, FIRST_PLAN).training.individual)).not.toContain(player.id)
    }
  })

  it('drops the plans of players who left or reached their ceiling', () => {
    const [a, b] = trainable
    const withPlans = setTrainingPlan(setTrainingPlan(game, a, FIRST_PLAN), b, FIRST_PLAN)
    const players = withPlans.world.players
    const changed = {
      ...withPlans,
      world: {
        ...withPlans.world,
        players: {
          ...players,
          [a]: { ...players[a], clubId: 'C1' },
          [b]: { ...players[b], potential: players[b].overall },
        },
      },
    }
    expect(keepOwnFocus(changed).training.individual).toEqual({})
  })

  it('tires players who train hard and spares those who take it easy', () => {
    const id = trainable[0]
    const plan = (intensity: 'leve' | 'intenso') =>
      recoveryRate(setTrainingPlan(game, id, { focus: 'geral', intensity }), id)
    expect(plan('intenso')).toBeLessThan(1)
    expect(plan('leve')).toBeGreaterThan(1)
    expect(recoveryRate(game, id)).toBe(1)
  })

  it('works a general plan on the attributes that count most for the position', () => {
    expect(keyAttributes('G')).toContain('reflexes')
    expect(keyAttributes('A')).toContain('finishing')
    expect(keyAttributes('Z')).toHaveLength(TRAINING.generalAttributes)
  })

  it('rests the squad: quicker recovery, fewer injuries; physical work brings more', () => {
    const resting = setSquadFocus(game, 'descanso')
    expect(recoveryRate(resting, squad[0])).toBe(TRAINING.restRecovery)
    expect(recoveryRate(resting, game.world.clubs.C1.playerIds[0])).toBe(1)
    expect(injuryRisk(resting.training)).toBeLessThan(1)
    expect(injuryRisk(setSquadFocus(game, 'fisico').training)).toBeGreaterThan(1)
    const season = {
      ...game.season,
      fitness: { [squad[0]]: { energy: 50, date: game.today } },
    }
    const player = game.world.players[squad[0]]
    const tomorrow = '2027-01-03'
    expect(conditionOn(season, player, tomorrow, recoveryRate(resting, player.id))).toBeGreaterThan(
      conditionOn(season, player, tomorrow),
    )
  })

  it('makes the focused attributes grow faster over a year of steps', () => {
    const youngster = young[0]
    const year = (focus: boolean) => {
      let total = 0
      for (let seed = 0; seed < 30; seed++) {
        let p = youngster
        const rng = createRng(seed)
        for (let i = 0; i < PROGRESSION.steps; i++) {
          const share = 1 / PROGRESSION.steps
          p = developStep(p, 1, share, rng, {
            ...(focus && {
              focus: {
                attributes: FOCUS_ATTRIBUTES.finalizacao,
                points: TRAINING.perSeason.normal * share,
              },
            }),
          })
        }
        total += p.attributes.finishing - youngster.attributes.finishing
      }
      return total / 30
    }
    expect(year(true) - year(false)).toBeGreaterThan(2)
  })
})

describe('monthly development', () => {
  it('moves the young players along each month and keeps the user’s changes', () => {
    const played: GameState = { ...game, season: { ...game.season, round: 6 } }
    const next = developWorld(played, createRng(1))
    expect(next.growth?.date).toBe(game.today)
    expect(Object.keys(next.growth!.overall).sort()).toEqual([...squad].sort())
    const moved = Object.values(next.world.players).filter(
      (p) => p.overall !== game.world.players[p.id].overall,
    )
    expect(moved.length).toBeGreaterThan(0)
  })

  it('steps on the 1st of May to December, then at the close', () => {
    let next = game
    const dates = new Set<string>()
    while (!isSeasonOver(next.season)) {
      next = playRound(next)
      if (next.growth) dates.add(next.growth.date)
    }
    expect([...dates].map((d) => d.slice(5))).toEqual(
      ['05-01', '06-01', '07-01', '08-01', '09-01', '10-01', '11-01', '12-01'].slice(0, dates.size),
    )
    const after = startNextSeason(pleased(next))
    for (const id of squad) {
      const p = after.world.players[id]
      if (p.clubId === 'C5') expect(p.age).toBe(game.world.players[id].age + 1)
    }
  })
})

describe('recommended training', () => {
  const players = squad.map((id) => game.world.players[id])
  const of = (position: string) => players.find((p) => p.position === position)!
  const best = (gains: Record<string, number>, n: number) =>
    Object.entries(gains)
      .filter(([focus]) => focus !== 'geral')
      .sort((a, b) => b[1] - a[1])
      .slice(0, n)
      .map(([focus]) => focus)

  /** A player of the position with every attribute at 60, so only the position decides. */
  const flat = (position: string) => {
    const player = of(position)
    const attributes = Object.fromEntries(
      Object.keys(player.attributes).map((a) => [a, 60]),
    ) as typeof player.attributes
    return { ...player, attributes }
  }

  it('points each position at what counts for it', () => {
    expect(best(focusGains(flat('Z')), 2)).toEqual(['defesa', 'cabeceio'])
    expect(best(focusGains(flat('A')), 1)).toEqual(['finalizacao'])
    expect(best(focusGains(flat('M')), 1)).toEqual(['passe'])
    const keeper = focusGains(flat('G'))
    expect(best(keeper, 1)).toEqual(['goleiro'])
    expect(keeper.finalizacao).toBe(0)
  })

  it('recommends the general plan until its attributes run out of room', () => {
    for (const position of ['G', 'Z', 'L', 'M', 'A']) {
      expect(recommendedFocus(flat(position))).toBe('geral')
    }
    const passer = flat('M')
    const capped = {
      ...passer,
      attributes: { ...passer.attributes, shortPassing: 99, vision: 99, longPassing: 99 },
    }
    expect(recommendedFocus(capped)).toBe('drible')
  })

  it('stops counting an attribute once it reaches 99', () => {
    const defender = flat('Z')
    const maxed = {
      ...defender,
      attributes: { ...defender.attributes, marking: 99, tackling: 99, interceptions: 99 },
    }
    expect(focusGains(maxed).defesa).toBe(0)
    expect(focusGains(maxed).cabeceio).toBe(focusGains(defender).cabeceio)
  })

  it('puts the squad on its recommended plans, keeping intensities', () => {
    const [first, second] = trainable
    const set = setTrainingPlan(game, first, { focus: 'passe', intensity: 'intenso' })
    const idle = setRecommendedPlans(set, true).training.individual
    expect(idle[first]).toEqual({ focus: 'passe', intensity: 'intenso' })
    expect(idle[second]).toEqual({
      focus: recommendedFocus(game.world.players[second]),
      intensity: 'normal',
    })
    expect(Object.keys(idle).sort()).toEqual([...trainable].sort())
    const all = setRecommendedPlans(set).training.individual
    expect(all[first]).toEqual({
      focus: recommendedFocus(game.world.players[first]),
      intensity: 'intenso',
    })
  })
})
