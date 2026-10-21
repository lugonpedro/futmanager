import { useEffect, useState } from 'react'
import type { World } from '../engine/model/types.ts'
import { roomWorld } from '../engine/room/start.ts'
import { BUILT_IN_PACKS } from '../packs/index.ts'

/**
 * The world a room of this pack drafts from, built here from the pack itself:
 * the same one the server builds, so its players are the room's, with
 * everything a card shows.
 */
export function usePackWorld(packId: string | undefined): World | undefined {
  const [loaded, setLoaded] = useState<{ packId: string; world: World }>()
  useEffect(() => {
    const built = BUILT_IN_PACKS.find((p) => p.id === packId)
    if (!built) return
    let live = true
    built
      .load()
      .then((pack) => live && setLoaded({ packId: built.id, world: roomWorld(pack) }))
      .catch(() => undefined)
    return () => {
      live = false
    }
  }, [packId])
  return loaded && loaded.packId === packId ? loaded.world : undefined
}
