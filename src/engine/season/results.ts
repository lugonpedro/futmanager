import type { FixtureResult, MatchResult } from '../model/types.ts'

export function toFixtureResult(result: MatchResult): FixtureResult {
  return {
    homeGoals: result.homeGoals,
    awayGoals: result.awayGoals,
    goals: result.events
      .filter((e) => e.type === 'gol' && e.playerId && e.clubId)
      .map((e) => ({ playerId: e.playerId!, clubId: e.clubId!, minute: e.minute })),
    cards: {
      home: { yellow: result.stats.home.yellowCards, red: result.stats.home.redCards },
      away: { yellow: result.stats.away.yellowCards, red: result.stats.away.redCards },
    },
  }
}
