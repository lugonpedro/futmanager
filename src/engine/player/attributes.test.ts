import { describe, expect, it } from 'vitest'
import { playerProfile } from '../generate/player.ts'
import { generateWorld } from '../generate/world.ts'
import type { Player, Position } from '../model/types.ts'
import { createRng } from '../rng.ts'
import {
  earnedStyles,
  faces,
  gainStyles,
  MAX_STYLES,
  nextStyle,
  overallAt,
  STYLE_ATTRIBUTES,
  STYLE_PLUS_FROM,
  styleLevel,
  STYLES_BY_POSITION,
} from './attributes.ts'

const POSITIONS: Position[] = ['G', 'Z', 'L', 'M', 'A']

describe('attributes', () => {
  it('land the overall on the target in every position', () => {
    const rng = createRng(1)
    for (const position of POSITIONS) {
      for (const target of [15, 40, 65, 90]) {
        const profile = playerProfile(rng, position, target)
        expect(Math.abs(profile.overall - target)).toBeLessThanOrEqual(1)
        expect(overallAt(profile.attributes, position)).toBe(profile.overall)
        for (const value of Object.values(profile.attributes)) {
          expect(value).toBeGreaterThanOrEqual(1)
          expect(value).toBeLessThanOrEqual(99)
        }
      }
    }
  })

  it('shape each position: defenders defend, strikers finish, keepers keep', () => {
    const rng = createRng(2)
    const face = (position: Position, name: string) => {
      const p = { position, ...playerProfile(rng, position, 70, []) } as Player
      return faces(p).find((f) => f.face === name)!.value
    }
    const average = (fn: () => number) =>
      Array.from({ length: 50 }, fn).reduce((a, b) => a + b, 0) / 50
    expect(average(() => face('Z', 'DEF'))).toBeGreaterThan(average(() => face('A', 'DEF')) + 15)
    expect(average(() => face('A', 'FIN'))).toBeGreaterThan(average(() => face('Z', 'FIN')) + 15)
    expect(average(() => face('M', 'PAS'))).toBeGreaterThan(average(() => face('Z', 'PAS')))
    expect(average(() => face('G', 'REF'))).toBeGreaterThan(65)
  })

  it('give a player secondary positions only next to his own', () => {
    const world = generateWorld(5)
    const players = Object.values(world.players)
    const next: Record<Position, Position[]> = {
      G: [],
      Z: ['L'],
      L: ['Z', 'M'],
      M: ['L', 'A'],
      A: ['M'],
    }
    for (const p of players) {
      for (const other of p.secondary) expect(next[p.position]).toContain(other)
    }
    const share = players.filter((p) => p.secondary.length > 0).length / players.length
    expect(share).toBeGreaterThan(0.2)
    expect(share).toBeLessThan(0.9)
  })

  it('keeps the "+" of a style for players outstanding in it', () => {
    const world = generateWorld(6)
    const players = Object.values(world.players)
    const levels = players.flatMap((p) => p.styles.map((s) => styleLevel(p, s)))
    expect(levels.filter((l) => l === 2).length).toBeGreaterThan(0)
    expect(levels.filter((l) => l === 1).length).toBeGreaterThan(
      levels.filter((l) => l === 2).length,
    )
    const p = players.find((x) => x.styles.length > 0)!
    const raised = {
      ...p,
      attributes: Object.fromEntries(
        Object.keys(p.attributes).map((k) => [k, STYLE_PLUS_FROM]),
      ) as Player['attributes'],
    }
    expect(styleLevel(raised, p.styles[0])).toBe(2)
    expect(styleLevel({ ...p, styles: [] }, p.styles[0])).toBe(0)
  })

  it('give each player the styles his attributes earn, strong players more of them', () => {
    const players = Object.values(generateWorld(7).players)
    const average = (list: Player[]) =>
      list.reduce((sum, p) => sum + p.styles.length, 0) / list.length
    for (const p of players) {
      expect(p.styles).toEqual(earnedStyles(p.attributes, p.position))
      expect(p.styles.length).toBeLessThanOrEqual(MAX_STYLES)
      for (const style of p.styles) expect(STYLES_BY_POSITION[p.position]).toContain(style)
    }
    const strong = players.filter((p) => p.overall >= 70)
    const weak = players.filter((p) => p.overall < 50)
    expect(average(strong)).toBeGreaterThan(1.2)
    expect(average(weak)).toBeLessThan(average(strong))
    const seen = new Set(players.flatMap((p) => p.styles))
    for (const style of ['chutador', 'cobrador', 'incansavel', 'trator', 'lancador'] as const) {
      expect(seen).toContain(style)
    }
  })

  it('never take a style away, and pick up one the attributes now earn', () => {
    const rng = createRng(9)
    const p = { position: 'A', ...playerProfile(rng, 'A', 70, []) } as Player
    const keys = STYLE_ATTRIBUTES.velocista
    const quick = {
      ...p.attributes,
      ...Object.fromEntries(keys.map((k) => [k, p.attributes[k] + 20])),
    }
    const styles = gainStyles(['cabeceador'], quick, 'A')
    expect(styles[0]).toBe('cabeceador')
    expect(styles).toContain('velocista')
    const full = gainStyles(['cabeceador', 'finalizador', 'driblador'], quick, 'A')
    expect(full).toEqual(['cabeceador', 'finalizador', 'driblador'])
  })

  it('turn a "+" back into the plain style when the attributes fall', () => {
    const rng = createRng(10)
    const p = { position: 'A', ...playerProfile(rng, 'A', 80, []) } as Player
    const star = (value: number) => ({
      ...p,
      styles: ['velocista' as const],
      attributes: { ...p.attributes, acceleration: value, sprintSpeed: value },
    })
    expect(styleLevel(star(90), 'velocista')).toBe(2)
    expect(styleLevel(star(70), 'velocista')).toBe(1)
  })

  it('point at a style a player is close to but does not have yet', () => {
    const players = Object.values(generateWorld(11).players)
    const close = players.filter((p) => nextStyle(p) !== undefined)
    expect(close.length).toBeGreaterThan(players.length / 10)
    for (const p of close) expect(p.styles).not.toContain(nextStyle(p))
    const full = players.find((p) => p.styles.length === MAX_STYLES)!
    expect(nextStyle(full)).toBeUndefined()
  })

  it('come out the same from the same seed', () => {
    expect(generateWorld(8).players).toEqual(generateWorld(8).players)
  })
})
