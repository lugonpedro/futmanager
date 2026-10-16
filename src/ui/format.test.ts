import { describe, expect, it } from 'vitest'
import { playerProfile } from '../engine/generate/player.ts'
import { positionFit } from '../engine/match/strength.ts'
import type { Player, Position } from '../engine/model/types.ts'
import { createRng } from '../engine/rng.ts'
import {
  CARD_CUTS,
  cardTier,
  fitLevel,
  rangeText,
  signedChange,
  sponsorGoalText,
} from './format.ts'

const player = (position: Position, overall = 70) =>
  ({ position, ...playerProfile(createRng(1), position, overall, []) }) as Player

describe('position fit colours', () => {
  it('reads green in his own position, yellow in a secondary one and red elsewhere', () => {
    const back = player('Z')
    expect(fitLevel(positionFit(back, 'Z'))).toBe('good')
    expect(fitLevel(positionFit({ ...back, secondary: ['L'] }, 'L'))).not.toBe('good')
    expect(fitLevel(positionFit(back, 'A'))).toBe('poor')
    expect(fitLevel(positionFit(player('A'), 'G'))).toBe('poor')
  })
})

describe('card colours', () => {
  it('go bronze, silver and gold by overall', () => {
    expect(cardTier(player('M', CARD_CUTS.prata - 1))).toBe('bronze')
    expect(cardTier(player('M', CARD_CUTS.prata))).toBe('prata')
    expect(cardTier(player('M', CARD_CUTS.ouro))).toBe('ouro')
  })
})

describe('sponsorGoalText', () => {
  it('reads after "se o time"', () => {
    expect(sponsorGoalText({ kind: 'posicao', position: 1 }, 1)).toBe('for campeão da Série A')
    expect(sponsorGoalText({ kind: 'posicao', position: 4 }, 2)).toBe('conquistar o acesso')
    expect(sponsorGoalText({ kind: 'posicao', position: 4 }, 1)).toBe('ficar no G-4')
    expect(sponsorGoalText({ kind: 'posicao', position: 8 }, 1)).toBe(
      'terminar entre os 8 primeiros',
    )
    expect(sponsorGoalText({ kind: 'final-copa' }, 1)).toMatch(/^chegar à final/)
  })
})

describe('ranges and changes', () => {
  it('writes a range, or one number once it is known', () => {
    expect(rangeText({ low: 55, high: 65 })).toBe('55 a 65')
    expect(rangeText({ low: 70, high: 70 })).toBe('70')
  })

  it('signs a change in overall', () => {
    expect(signedChange(2)).toBe('+2')
    expect(signedChange(-1)).toBe('-1')
    expect(signedChange(0)).toBe('0')
  })
})
