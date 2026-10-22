import type { DraftTeam } from '../cloud/draft.ts'
import type { Room } from '../cloud/rooms.ts'
import type { TeamSheet } from '../engine/room/summary.ts'
import type { PlayerAvailability } from './components/PlayerStatus.tsx'
import type { News } from './news.ts'

/** The people's teams of a room, split by whether they marked "Pronto" for the round. */
export function readiness(teams: readonly DraftTeam[], round: number) {
  const people = teams.filter((t) => !t.robot && t.userId)
  const ready = people.filter((t) => t.readyRound === round)
  return { people, ready, waiting: people.filter((t) => t.readyRound !== round) }
}

/**
 * Whether the player may play the round now, as the database decides in
 * `can_play_round`: anyone once everyone is ready, the owner at any time.
 */
export const canPlayRound = (room: Room, userId: string, everyoneReady: boolean) =>
  everyoneReady || room.ownerId === userId

/** Why a player of a room's team is out, or close to a ban, from the team's sheet. */
export function sheetAvailability(sheet: TeamSheet, id: string): PlayerAvailability {
  return {
    injuredRounds: sheet.injured?.[id],
    suspended: sheet.suspended?.[id],
    yellows: sheet.yellows?.[id],
  }
}

/**
 * The absences of the player's team to announce, as the career's toasts:
 * every injury and ban in the sheet not announced before, by `id:kind`.
 */
export function absenceNews(
  sheet: TeamSheet,
  announced: ReadonlySet<string>,
): { news: News[]; keys: string[] } {
  const name = (id: string) => sheet.players.find((p) => p.id === id)?.name ?? 'Um jogador'
  const rounds = (n: number) => `${n} ${n === 1 ? 'rodada' : 'rodadas'}`
  const news: News[] = []
  const keys: string[] = []
  for (const [id, n] of Object.entries(sheet.injured ?? {})) {
    keys.push(`${id}:lesao`)
    if (announced.has(`${id}:lesao`)) continue
    news.push({
      tone: 'warning',
      text:
        n === 1
          ? `${name(id)} se lesionou e fica fora da próxima rodada.`
          : `${name(id)} se lesionou e fica fora das próximas ${rounds(n)}.`,
    })
  }
  for (const [id, n] of Object.entries(sheet.suspended ?? {})) {
    keys.push(`${id}:suspensao`)
    if (announced.has(`${id}:suspensao`)) continue
    news.push({ tone: 'warning', text: `${name(id)} está suspenso por ${rounds(n)}.` })
  }
  return { news, keys }
}

const announcedKey = (room: number) => `sala-${room}-desfalques-avisados`

/** The absences already announced in this room on this device. */
export function announcedAbsences(room: number): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(announcedKey(room)) ?? '[]') as string[])
  } catch {
    return new Set()
  }
}

export function saveAnnouncedAbsences(room: number, keys: readonly string[]) {
  try {
    localStorage.setItem(announcedKey(room), JSON.stringify(keys))
  } catch {
    // Without storage the same absences are announced again on the next visit, which is harmless.
  }
}
