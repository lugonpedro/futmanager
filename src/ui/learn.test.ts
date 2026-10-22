import { describe, expect, it } from 'vitest'
import { LEARN_TABS, MOVED_SECTIONS, type LearnContent, type LearnTab } from './learn.ts'

const tabs = Object.entries(LEARN_TABS) as [LearnTab, (typeof LEARN_TABS)[LearnTab]][]

describe('Aprenda', () => {
  it('keeps every section short, with no number missing', () => {
    for (const [, guide] of tabs) {
      const content = guide.content as Record<string, LearnContent>
      expect(Object.keys(content)).toEqual([...guide.sections])
      for (const { title, items } of Object.values(content)) {
        expect(items.length, title).toBeGreaterThan(0)
        expect(items.length, title).toBeLessThanOrEqual(3)
        for (const text of [guide.intro, title, ...items]) {
          expect(text).not.toMatch(/undefined|NaN/)
        }
      }
    }
  })

  it('sends the old career sections somewhere that exists', () => {
    for (const { tab, section } of Object.values(MOVED_SECTIONS)) {
      expect(LEARN_TABS[tab].sections as readonly string[]).toContain(section)
    }
  })
})
