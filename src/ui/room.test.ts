import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM_OPTIONS } from '../engine/room/types.ts'
import {
  checkDraftAt,
  checkRoomDraft,
  describeOptions,
  fromLocalInput,
  readRoomInviteCode,
  roomInviteLink,
  suggestedDraftAt,
  toLocalInput,
} from './room.ts'

describe('room invites', () => {
  it('reads the code from a link or as typed', () => {
    const link = roomInviteLink('https://onzemestre.app', 'ABCD2345')
    expect(link).toBe('https://onzemestre.app/sala/convite/ABCD2345')
    expect(readRoomInviteCode(link)).toBe('ABCD2345')
    expect(readRoomInviteCode('  abcd2345 ')).toBe('ABCD2345')
  })
})

describe('draft time', () => {
  const now = new Date(2026, 9, 20, 15, 30)

  it('suggests tomorrow at 21h', () => {
    expect(toLocalInput(suggestedDraftAt(now))).toBe('2026-10-21T21:00')
  })

  it('goes back and forth with the input', () => {
    expect(fromLocalInput(toLocalInput(now))?.getTime()).toBe(now.getTime())
    expect(fromLocalInput('')).toBeUndefined()
  })

  it('takes from now to a week on', () => {
    const day = 24 * 3600 * 1000
    expect(checkDraftAt(new Date(now.getTime() + day), now)).toBeUndefined()
    expect(checkDraftAt(new Date(now.getTime() - 60_000), now)).toMatch(/depois de agora/)
    expect(checkDraftAt(new Date(now.getTime() + 8 * day), now)).toMatch(/7 dias/)
    expect(checkDraftAt(undefined, now)).toMatch(/Escolha/)
  })

  it('checks the room name too', () => {
    const draft = { name: 'ab', options: DEFAULT_ROOM_OPTIONS, draftAt: '2026-10-21T21:00' }
    expect(checkRoomDraft(draft, now)).toMatch(/nome/)
    expect(checkRoomDraft({ ...draft, name: 'Amigos' }, now)).toBeUndefined()
  })
})

describe('describeOptions', () => {
  it('sums up the default room', () => {
    expect(describeOptions(DEFAULT_ROOM_OPTIONS)).toEqual([
      '8 times',
      'elenco de 16',
      'ordem invertida na 3ª volta',
      '45 s por escolha',
      'todas as escolhas na mão',
      'ida e volta',
      'lesões normais',
      'trocas a liga toda',
    ])
  })
})
