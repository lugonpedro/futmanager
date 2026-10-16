import { describe, expect, it } from 'vitest'
import type { GameState } from '../model/types.ts'
import { createRng } from '../rng.ts'
import { conditionOn } from '../season/form.ts'
import { isSeasonOver, newGame, playRound, startNextSeason } from '../season/season.ts'
import { developStep, developWorld, PROGRESSION } from './progression.ts'
import {
  FOCUS_ATTRIBUTES,
  injuryRisk,
  keepOwnFocus,
  NO_TRAINING,
  recoveryRate,
  setIndividualFocus,
  setSquadFocus,
  TRAINING,
} from './training.ts'

const game = newGame(3, 'C5')
const squad = game.world.clubs.C5.playerIds
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

  it('gives up to five of the user’s players a focus of their own', () => {
    let next = game
    for (const id of squad.slice(0, 6)) next = setIndividualFocus(next, id, 'passe')
    expect(Object.keys(next.training.individual)).toEqual(squad.slice(0, TRAINING.maxIndividual))
    next = setIndividualFocus(next, squad[0], 'drible')
    expect(next.training.individual[squad[0]]).toBe('drible')
    next = setIndividualFocus(next, squad[0], undefined)
    expect(next.training.individual[squad[0]]).toBeUndefined()
    const other = game.world.clubs.C1.playerIds[0]
    expect(setIndividualFocus(game, other, 'passe')).toBe(game)
  })

  it('drops the focus of players who left', () => {
    const withFocus = setIndividualFocus(game, squad[0], 'passe')
    const sold = {
      ...withFocus,
      world: {
        ...withFocus.world,
        players: {
          ...withFocus.world.players,
          [squad[0]]: { ...withFocus.world.players[squad[0]], clubId: 'C1' },
        },
      },
    }
    expect(keepOwnFocus(sold).training.individual).toEqual({})
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
                points: TRAINING.individualPerSeason * share,
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
