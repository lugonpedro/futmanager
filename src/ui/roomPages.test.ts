import { describe, expect, it } from 'vitest'
import { roomPageSlug } from './roomPages.ts'

describe('roomPageSlug', () => {
  it('reads the page from the address, and the summary for anything else', () => {
    expect(roomPageSlug(undefined)).toBe('')
    expect(roomPageSlug('mercado')).toBe('mercado')
    expect(roomPageSlug('rodadas')).toBe('rodadas')
    expect(roomPageSlug('nada')).toBe('')
  })
})
