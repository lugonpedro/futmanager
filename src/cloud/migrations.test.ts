import { describe, expect, it } from 'vitest'

// The Supabase CLI keys applied migrations by the timestamp in the file name,
// so two files with the same one make `supabase db push` fail halfway.
describe('supabase migrations', () => {
  it('have unique versions', () => {
    const files = Object.keys(import.meta.glob('../../supabase/migrations/*.sql'))
    const versions = files.map((f) => f.split('/').at(-1)!.split('_')[0])
    const repeated = versions.filter((v, i) => versions.indexOf(v) !== i)
    expect(files.length).toBeGreaterThan(0)
    expect(repeated).toEqual([])
  })
})
