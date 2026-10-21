import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import type { DraftTeam } from '../../cloud/draft.ts'
import { loadTeamSheet } from '../../cloud/roomLeague.ts'
import type { Room } from '../../cloud/rooms.ts'
import type { Player } from '../../engine/model/types.ts'
import { primePlayer } from '../../engine/room/prime.ts'
import type { TeamSheet } from '../../engine/room/summary.ts'
import type { DraftPlayer } from '../draft.ts'
import { POSITION_NAMES, POSITION_ORDER } from '../format.ts'
import { sheetAvailability } from '../roomLeague.ts'
import { usePackWorld } from '../usePackWorld.ts'
import { FormArrow } from './PlayerSheetView.tsx'
import { AvailabilityTags } from './PlayerStatus.tsx'
import { RoomPlayerSheet } from './RoomPlayerSheet.tsx'
import { TeamCrest } from './RoomParts.tsx'

type Row = { id: string; name: string; position: Player['position']; overall: number }

/**
 * A room team's squad, from the table: as the last round left it, with
 * condition, form and who is out, or as drafted before the first round.
 * Tapping a name opens the player's whole sheet.
 */
export function RoomTeamSquad(props: {
  room: Room
  team: DraftTeam
  /** The squad's ids now, after trades. */
  squad: readonly string[]
  byId: ReadonlyMap<string, DraftPlayer>
  onClose: () => void
}) {
  const { room, team, byId } = props
  const [sheet, setSheet] = useState<TeamSheet>()
  const [viewing, setViewing] = useState<string>()
  const world = usePackWorld(room.pack)

  useEffect(() => {
    let live = true
    loadTeamSheet(room.id, team.slot)
      .then((found) => live && setSheet(found))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [room.id, team.slot])

  const rows: Row[] = (sheet?.players ?? props.squad.map((id) => byId.get(id)))
    .filter((p) => p !== undefined)
    .sort(
      (a, b) => POSITION_ORDER[a.position] - POSITION_ORDER[b.position] || b.overall - a.overall,
    )

  // The sheet's player is the one playing the league; before it, the card as drafted.
  const playerOf = (id: string): { player: Player; prime: boolean } | undefined => {
    const drafted = byId.get(id)
    const inSheet = sheet?.players.find((p) => p.id === id)
    if (inSheet) return { player: inSheet, prime: !!drafted?.prime }
    const full = world?.players[id]
    if (!full || !drafted) return undefined
    return {
      player: {
        ...primePlayer(full, drafted.prime ?? 0),
        name: drafted.name,
        overall: drafted.overall,
      },
      prime: !!drafted.prime,
    }
  }
  const viewed = viewing ? playerOf(viewing) : undefined

  return (
    <>
      <Dialog open onOpenChange={(on) => !on && props.onClose()}>
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogTitle className="flex items-center gap-2">
            <TeamCrest team={team} id={`elenco-tabela-${team.slot}`} className="size-6" />
            {team.name}
          </DialogTitle>
          <DialogDescription>Toque no nome para ver a carta completa.</DialogDescription>
          <ul className="flex flex-col text-sm">
            {rows.map((row) => (
              <li key={row.id} className="flex items-center gap-2 py-1">
                <span className="w-4 font-semibold" title={POSITION_NAMES[row.position]}>
                  {row.position}
                </span>
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5">
                  <button
                    type="button"
                    onClick={() => setViewing(row.id)}
                    className="cursor-pointer truncate text-left hover:underline"
                  >
                    {row.name}
                  </button>
                  {sheet && <AvailabilityTags {...sheetAvailability(sheet, row.id)} />}
                </span>
                {sheet && <FormArrow form={sheet.form[row.id] ?? 0} />}
                {sheet && (
                  <span
                    className="w-9 text-right text-xs text-muted-foreground tabular-nums"
                    title="Energia"
                  >
                    {Math.round(sheet.condition[row.id] ?? 100)}%
                  </span>
                )}
                <span className="w-6 text-right font-semibold tabular-nums">{row.overall}</span>
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
      {viewed && (
        <RoomPlayerSheet
          player={viewed.player}
          prime={viewed.prime}
          world={world}
          team={team.name}
          sheet={sheet}
          onClose={() => setViewing(undefined)}
        />
      )}
    </>
  )
}
