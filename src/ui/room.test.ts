import { describe, expect, it } from 'vitest'
import { DEFAULT_ROOM_OPTIONS } from '../engine/room/types.ts'
import { checkRoomDraft, describeOptions, readRoomInviteCode, roomInviteLink } from './room.ts'

describe('room invites', () => {
  it('reads the code from a link or as typed', () => {
    const link = roomInviteLink('https://onzemestre.app', 'ABCD2345')
    expect(link).toBe('https://onzemestre.app/sala/convite/ABCD2345')
    expect(readRoomInviteCode(link)).toBe('ABCD2345')
    expect(readRoomInviteCode('  abcd2345 ')).toBe('ABCD2345')
  })
})

describe('checkRoomDraft', () => {
  it('checks the room name', () => {
    const draft = { name: 'ab', options: DEFAULT_ROOM_OPTIONS }
    expect(checkRoomDraft(draft)).toMatch(/nome/)
    expect(checkRoomDraft({ ...draft, name: 'Amigos' })).toBeUndefined()
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
