import { describe, expect, it } from 'vitest'
import { pageOf } from './paging.ts'

const list = Array.from({ length: 23 }, (_, i) => i)

describe('pageOf', () => {
  it('cuts the list into pages of the given size', () => {
    const page = pageOf(list, 1, 10)
    expect(page.items).toEqual([10, 11, 12, 13, 14, 15, 16, 17, 18, 19])
    expect(page).toMatchObject({ page: 1, pages: 3, start: 10, total: 23 })
  })

  it('keeps the short last page', () => {
    expect(pageOf(list, 2, 10).items).toEqual([20, 21, 22])
  })

  it('clamps a page past the end, as when a filter shrinks the list', () => {
    expect(pageOf(list, 9, 10)).toMatchObject({ page: 2, start: 20 })
    expect(pageOf(list, -1, 10)).toMatchObject({ page: 0, start: 0 })
  })

  it('has one empty page for an empty list', () => {
    expect(pageOf([], 3, 10)).toEqual({ items: [], page: 0, pages: 1, start: 0, total: 0 })
  })
})
