import { describe, expect, it } from 'vitest'
import { positionFit } from '../engine/match/strength.ts'
import type { Player } from '../engine/model/types.ts'
import { fitLevel } from './format.ts'

describe('position fit colours', () => {
  const player = (position: Player['position']) => ({ position }) as Player

  it('reads green in his own position, yellow next to it and red elsewhere', () => {
    expect(fitLevel(positionFit(player('Z'), 'Z'))).toBe('good')
    expect(fitLevel(positionFit(player('Z'), 'L'))).toBe('fair')
    expect(fitLevel(positionFit(player('Z'), 'A'))).toBe('poor')
    expect(fitLevel(positionFit(player('A'), 'G'))).toBe('poor')
  })
})
