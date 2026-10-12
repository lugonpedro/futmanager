import { describe, expect, it } from 'vitest'
import { planSync, type SyncBase } from './plan.ts'

const me = 'user-1'
const at = (id: string, updatedAt: number) => ({ id, updatedAt })
const base = (id: string, updatedAt: number, extra: Partial<SyncBase> = {}): SyncBase => ({
  id,
  userId: me,
  updatedAt,
  ...extra,
})

describe('planSync', () => {
  it('uploads careers the account has never seen and downloads the ones only it has', () => {
    expect(planSync(me, [at('a', 1)], [at('b', 2)], [])).toEqual([
      { kind: 'upload', id: 'a' },
      { kind: 'download', id: 'b' },
    ])
  })

  it('does nothing when both sides match what was synced', () => {
    expect(planSync(me, [at('a', 5)], [at('a', 5)], [base('a', 5)])).toEqual([])
  })

  it('remembers a match it had not recorded yet', () => {
    expect(planSync(me, [at('a', 5)], [at('a', 5)], [])).toEqual([
      { kind: 'mark', id: 'a', updatedAt: 5 },
    ])
  })

  it('sends a career played here and fetches one played elsewhere', () => {
    expect(
      planSync(
        me,
        [at('a', 9), at('b', 5)],
        [at('a', 5), at('b', 7)],
        [base('a', 5), base('b', 5)],
      ),
    ).toEqual([
      { kind: 'upload', id: 'a', base: 5 },
      { kind: 'download', id: 'b' },
    ])
  })

  it('asks when the same career was played on both devices', () => {
    expect(planSync(me, [at('a', 8)], [at('a', 9)], [base('a', 5)])).toEqual([
      { kind: 'conflict', id: 'a', local: 8, remote: 9 },
    ])
  })

  it('asks when both have a career with the same slot and no shared history', () => {
    expect(planSync(me, [at('a', 8)], [at('a', 9)], [])).toEqual([
      { kind: 'conflict', id: 'a', local: 8, remote: 9 },
    ])
  })

  it('deletes in the cloud a career deleted here', () => {
    expect(planSync(me, [], [at('a', 5)], [base('a', 5, { deleted: true })])).toEqual([
      { kind: 'deleteRemote', id: 'a', base: 5 },
    ])
  })

  it('keeps a career deleted here if it was played elsewhere afterwards', () => {
    expect(planSync(me, [], [at('a', 7)], [base('a', 5, { deleted: true })])).toEqual([
      { kind: 'download', id: 'a' },
    ])
  })

  it('deletes here a career deleted on another device, unless it was played here since', () => {
    expect(planSync(me, [at('a', 5), at('b', 8)], [], [base('a', 5), base('b', 5)])).toEqual([
      { kind: 'deleteLocal', id: 'a' },
      { kind: 'upload', id: 'b' },
    ])
  })

  it('forgets slots gone from both sides', () => {
    expect(planSync(me, [], [], [base('a', 5), base('b', 5, { deleted: true })])).toEqual([
      { kind: 'forget', id: 'a' },
      { kind: 'forget', id: 'b' },
    ])
  })

  it('ignores what was synced with another account', () => {
    const other = { ...base('a', 5), userId: 'user-2' }
    expect(planSync(me, [at('a', 5)], [], [other])).toEqual([{ kind: 'upload', id: 'a' }])
  })
})
