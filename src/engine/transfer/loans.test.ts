import { describe, expect, it } from 'vitest'
import type { GameState } from '../model/types.ts'
import { isSeasonOver, newGame, playRound, startNextSeason } from '../season/season.ts'
import { FIRST_PLAN, setTrainingPlan } from '../progression/training.ts'
import { checkLoan, isOnLoan, LOAN, loanClub, loanPlayer, returnLoans } from './loans.ts'
import { checkSigning, listPlayer, renewContract } from './market.ts'

const game = newGame(3, 'C5')
const squad = game.world.clubs.C5.playerIds.map((id) => game.world.players[id])
const youngster = squad.find(
  (p) => p.age <= LOAN.maxAge && p.position === 'M' && p.contractUntil > game.season.year,
)!
const veteran = squad.find((p) => p.age > LOAN.maxAge)!

/** The board happy whatever the results, so the manager stays on. */
const pleased = (g: GameState): GameState => ({
  ...g,
  career: { ...g.career, status: 'empregado', target: 20, confidence: 80 },
})

describe('loans', () => {
  it('sends young players to a club a division below', () => {
    expect(checkLoan(game, veteran.id)).toMatchObject({ ok: false })
    expect(checkLoan(game, youngster.id)).toEqual({ ok: true })
    const clubId = loanClub(game, youngster)!
    expect(game.world.clubs[clubId].division).toBe(game.world.clubs.C5.division + 1)

    const listed = setTrainingPlan(
      listPlayer(game, youngster.id, 1_000_000),
      youngster.id,
      FIRST_PLAN,
    )
    expect(listed.training.individual[youngster.id]).toEqual(FIRST_PLAN)
    const next = loanPlayer(listed, youngster.id)
    expect(isOnLoan(next, youngster.id)).toBe(true)
    expect(next.world.players[youngster.id]).toMatchObject({
      clubId,
      wage: youngster.wage,
      contractUntil: youngster.contractUntil,
    })
    expect(next.world.clubs.C5.playerIds).not.toContain(youngster.id)
    expect(next.market.listed[youngster.id]).toBeUndefined()
    expect(next.training.individual[youngster.id]).toBeUndefined()
    expect(next.world.clubs.C5.cash).toBe(game.world.clubs.C5.cash)
  })

  it('is closed outside the transfer windows', () => {
    const march = { ...game, today: '2027-03-10' }
    expect(checkLoan(march, youngster.id)).toMatchObject({ ok: false })
  })

  it('keeps loaned players off the market', () => {
    const next = loanPlayer(game, youngster.id)
    const bid = { fee: 10_000_000, wage: youngster.wage * 2, years: 3 }
    expect(checkSigning(next, youngster.id, bid)).toMatchObject({ ok: false })
  })

  it('lets the user renew a loaned player’s contract', () => {
    const next = loanPlayer(game, youngster.id)
    const wage = youngster.wage * 3
    const renewed = renewContract(next, youngster.id, wage, 2)
    expect(renewed.world.players[youngster.id].contractUntil).toBe(youngster.contractUntil + 2)
  })

  it('brings everyone back at the close of the season', () => {
    const next = loanPlayer(game, youngster.id)
    expect(returnLoans(next).world.players[youngster.id].clubId).toBe('C5')
    let played = next
    while (!isSeasonOver(played.season)) played = playRound(played)
    expect(played.world.players[youngster.id].clubId).not.toBe('C5')
    const after = startNextSeason(pleased(played))
    expect(after.loans).toEqual([])
    expect(after.world.players[youngster.id].clubId).toBe('C5')
    expect(after.world.clubs.C5.playerIds).toContain(youngster.id)
  })
})
