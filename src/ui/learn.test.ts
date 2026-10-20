import { describe, expect, it } from 'vitest'
import { BOARD } from '../engine/career/board.ts'
import { PROMOTION_SPOTS } from '../engine/season/rules.ts'
import { CAREER_GUIDE, CAREER_SECTIONS, learnPath, listText } from './learn.ts'
import { LEARN_SHOTS, shotPath } from './learnShots.ts'

const text = (content: { items: string[]; table?: { rows: string[][] } }) =>
  [...content.items, ...(content.table?.rows.flat() ?? [])].join('\n')

describe('Aprenda', () => {
  it('has both versions of every screenshot a section shows, and shows every one', () => {
    const shown = Object.values(CAREER_GUIDE).flatMap((section) => section.shot ?? [])
    expect([...shown].sort()).toEqual([...LEARN_SHOTS].sort())
    const files = Object.keys(import.meta.glob('../../public/aprenda/*.webp')).map((file) =>
      file.replace('../../public', ''),
    )
    for (const shot of LEARN_SHOTS) {
      for (const device of ['celular', 'computador'] as const) {
        expect(files).toContain(shotPath(shot, device))
      }
    }
  })

  it('has a title and some text in every section', () => {
    for (const id of CAREER_SECTIONS) {
      expect(CAREER_GUIDE[id].title).not.toBe('')
      expect(CAREER_GUIDE[id].items.length).toBeGreaterThan(0)
    }
  })

  it('never shows a number that failed to come through', () => {
    const all = Object.values(CAREER_GUIDE).map(text)
    for (const section of all) expect(section).not.toMatch(/undefined|NaN|\$\{/)
  })

  it('takes its numbers from the engine', () => {
    expect(text(CAREER_GUIDE.tabela)).toContain(`${PROMOTION_SPOTS} clubes sobem`)
    expect(text(CAREER_GUIDE.diretoria)).toContain(`começa em ${BOARD.startConfidence}`)
  })

  it('reads the season the way the game plays it', () => {
    const calendar = text(CAREER_GUIDE.calendario)
    expect(calendar).toContain('38 rodadas')
    expect(calendar).toContain('aos sábados de abril a dezembro')
    expect(calendar).toContain('junho e de setembro')
  })

  it('links to a tab or a section of it', () => {
    expect(learnPath({ tab: 'carreira' })).toBe('/aprenda/carreira')
    expect(learnPath({ tab: 'carreira', section: 'mercado' })).toBe('/aprenda/carreira#mercado')
  })

  it('lists words the Portuguese way', () => {
    expect(listText(['a'])).toBe('a')
    expect(listText(['a', 'b', 'c'])).toBe('a, b e c')
    expect(listText(['a', 'b'], 'ou')).toBe('a ou b')
  })
})
