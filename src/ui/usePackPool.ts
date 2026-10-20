import { useEffect, useState } from 'react'
import { draftPool, roomWorld, type PoolPlayer } from '../engine/room/start.ts'
import { BUILT_IN_PACKS } from '../packs/index.ts'

/**
 * The players a room of this pack will draft from, listed here from the pack
 * itself: the same list the server writes when the draft starts, so the queue
 * can be made before it.
 */
export function usePackPool(packId: string | undefined): PoolPlayer[] | undefined {
  const [pool, setPool] = useState<{ packId: string; players: PoolPlayer[] }>()
  useEffect(() => {
    const built = BUILT_IN_PACKS.find((p) => p.id === packId)
    if (!built) return
    let live = true
    built
      .load()
      .then((pack) => live && setPool({ packId: built.id, players: draftPool(roomWorld(pack)) }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [packId])
  return pool && pool.packId === packId ? pool.players : undefined
}
