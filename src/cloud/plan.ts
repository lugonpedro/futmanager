/** One side of a career slot as sync sees it: just when it was last saved. */
export type SlotStamp = { id: string; updatedAt: number }

/**
 * What this device remembers about a slot from the last sync with the account:
 * the save both sides had then, and whether the player has since deleted it here.
 */
export type SyncBase = { id: string; userId: string; updatedAt: number; deleted?: boolean }

export type SyncStep =
  /** Send this device's copy; `base` is the cloud copy it replaces, if any. */
  | { kind: 'upload'; id: string; base?: number }
  /** Replace (or create) this device's copy with the cloud one. */
  | { kind: 'download'; id: string }
  | { kind: 'deleteRemote'; id: string; base: number }
  | { kind: 'deleteLocal'; id: string }
  /** Both copies already match; just remember that. */
  | { kind: 'mark'; id: string; updatedAt: number }
  /** Nothing left on either side; forget the slot. */
  | { kind: 'forget'; id: string }
  /** Both sides changed since the last sync: the player confirms which one stays. */
  | { kind: 'conflict'; id: string; local: number; remote: number }

/**
 * Compares the careers on this device with the ones in the account. A side
 * that changed since the last sync wins; when both changed, it's a conflict.
 */
export function planSync(
  userId: string,
  local: SlotStamp[],
  remote: SlotStamp[],
  bases: SyncBase[],
): SyncStep[] {
  const here = new Map(local.map((s) => [s.id, s.updatedAt]))
  const there = new Map(remote.map((s) => [s.id, s.updatedAt]))
  // A base from another account says nothing about this one.
  const known = new Map(bases.filter((b) => b.userId === userId).map((b) => [b.id, b]))
  const ids = new Set([...here.keys(), ...there.keys(), ...known.keys()])
  const steps: SyncStep[] = []

  for (const id of [...ids].sort()) {
    const l = here.get(id)
    const r = there.get(id)
    const base = known.get(id)
    const b = base?.updatedAt

    if (base?.deleted && l === undefined) {
      if (r === undefined) steps.push({ kind: 'forget', id })
      // Played on another device after it was deleted here: that progress stays.
      else if (r !== b) steps.push({ kind: 'download', id })
      else steps.push({ kind: 'deleteRemote', id, base: r })
    } else if (l === undefined && r === undefined) {
      steps.push({ kind: 'forget', id })
    } else if (r === undefined) {
      // Synced before and untouched here since: it was deleted on another device.
      if (b !== undefined && l === b) steps.push({ kind: 'deleteLocal', id })
      else steps.push({ kind: 'upload', id })
    } else if (l === undefined) {
      steps.push({ kind: 'download', id })
    } else if (l === r) {
      if (b !== l) steps.push({ kind: 'mark', id, updatedAt: l })
    } else if (b !== undefined && l === b) {
      steps.push({ kind: 'download', id })
    } else if (b !== undefined && r === b) {
      steps.push({ kind: 'upload', id, base: r })
    } else {
      steps.push({ kind: 'conflict', id, local: l, remote: r })
    }
  }
  return steps
}
