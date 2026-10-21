import { describe, expect, it } from 'vitest'
import { isNoticeKind, NOTICE_PREF, roomNotice } from './roomNotices.ts'

const room = { id: 7, name: 'Liga da firma', pickSeconds: 45 }

describe('roomNotice', () => {
  it('opens the room and replaces the last notice of the same kind', () => {
    const notice = roomNotice('vez', room, {})
    expect(notice.url).toBe('/sala/7')
    expect(notice.tag).toBe('sala-7-vez')
    expect(notice.body).toContain('45 segundos')
  })

  it('tells a round from the end of the league', () => {
    expect(roomNotice('rodada', room, { round: 3, over: false }).title).toBe('Rodada 3 jogada')
    expect(roomNotice('rodada', room, { round: 14, over: true }).title).toBe('A liga acabou')
  })

  it('names who offered a trade', () => {
    expect(roomNotice('troca', room, { from: 'Bia FC' }).body).toMatch(/^Bia FC quer trocar/)
  })

  it('knows every kind, and which choice covers it', () => {
    expect(isNoticeKind('falta')).toBe(true)
    expect(isNoticeKind('outro')).toBe(false)
    expect(NOTICE_PREF.troca).toBe('market')
    expect(NOTICE_PREF.vez).toBe('rounds')
  })
})
