import { useDraggable, useDroppable } from '@dnd-kit/core'

/**
 * Makes an element both a drag handle and a drop target for swaps, for a
 * squad list inside `LineupEditor`. A starter shows in several places at
 * once, so each place gets its own id and carries the player's id as data.
 */
export function useSwapSpot(playerId: string, place: string, disabled = false) {
  const spot = { id: `${place}-${playerId}`, data: { playerId }, disabled }
  const drag = useDraggable(spot)
  const drop = useDroppable(spot)
  return {
    setNode: (node: HTMLElement | null) => {
      drag.setNodeRef(node)
      drop.setNodeRef(node)
    },
    listeners: drag.listeners,
    isDragging: drag.isDragging,
    isOver: drop.isOver,
  }
}
