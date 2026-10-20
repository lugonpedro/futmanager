import { describe, expect, it } from 'vitest'
import { checkTeamIdentity, suggestedTeam } from './team.ts'

const colors = { primary: '#112233', secondary: '#ffffff' }

describe('checkTeamIdentity', () => {
  it('takes a team the database takes', () => {
    expect(checkTeamIdentity({ name: 'Time da Ana', shortName: 'ANA', colors })).toBeUndefined()
  })

  it('refuses short names, bad short names and missing colours', () => {
    expect(checkTeamIdentity({ name: ' Ab ', shortName: 'ANA', colors })).toMatch(/nome/)
    expect(checkTeamIdentity({ name: 'Time', shortName: 'A', colors })).toMatch(/sigla/)
    expect(checkTeamIdentity({ name: 'Time', shortName: 'ana', colors })).toMatch(/sigla/)
    expect(
      checkTeamIdentity({ name: 'Time', shortName: 'ANA', colors: { ...colors, primary: 'red' } }),
    ).toMatch(/cores/)
  })
})

describe('suggestedTeam', () => {
  it('names the team after the nickname, with letters from it', () => {
    expect(suggestedTeam('João Silva', colors)).toEqual({
      name: 'Time de João Silva',
      shortName: 'JOA',
      colors,
    })
  })

  it('always suggests a team the room takes', () => {
    for (const nickname of ['', 'A', '!!', 'Um apelido bem comprido de verdade']) {
      expect(checkTeamIdentity(suggestedTeam(nickname, colors))).toBeUndefined()
    }
  })
})
