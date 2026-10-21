import type { Player, World } from '../../engine/model/types.ts'
import type { TeamSheet } from '../../engine/room/summary.ts'
import { sheetAvailability } from '../roomLeague.ts'
import { PlayerCard } from './PlayerCard.tsx'
import { PlayerSheetView } from './PlayerSheetView.tsx'

/**
 * A room player's whole sheet, as the career's: the card with his real club
 * when the pack's world is at hand, and, from his team's sheet in the league,
 * his condition, form and why he is out.
 */
export function RoomPlayerSheet(props: {
  player: Player
  world?: World
  prime?: boolean
  /** The room team he plays for. */
  team?: string
  sheet?: TeamSheet
  onClose: () => void
}) {
  const { player, world, sheet } = props
  const real = world?.players[player.id]
  const club = real && world.clubs[real.clubId]
  return (
    <PlayerSheetView
      player={player}
      onClose={props.onClose}
      subtitle={props.team}
      availability={sheet && sheetAvailability(sheet, player.id)}
      card={<PlayerCard player={player} club={club} tier={props.prime ? 'prime' : undefined} />}
      condition={sheet && Math.round(sheet.condition[player.id] ?? 100)}
      form={sheet?.form[player.id]}
    />
  )
}
