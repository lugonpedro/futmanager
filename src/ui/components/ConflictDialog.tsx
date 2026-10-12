import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { settleConflict, useAccountStore } from '../../store/account.ts'
import { slotProgress } from '../format.ts'

const savedAt = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })

/**
 * Asks which copy stays when a career was played on this device and on
 * another one since the last sync. The newer copy is the suggested one.
 */
export function ConflictDialog() {
  const conflict = useAccountStore((s) => s.conflicts[0])
  const [busy, setBusy] = useState(false)
  if (!conflict) return null

  const { local, remote } = conflict
  const remoteNewer = remote.updated_at > local.updatedAt
  const here = {
    where: 'Neste aparelho',
    progress: slotProgress(local),
    savedAt: local.updatedAt,
  }
  const there = {
    where: 'Na nuvem',
    progress: slotProgress({
      year: remote.year,
      round: remote.round,
      today: remote.today ?? undefined,
      seasonOver: remote.season_over,
    }),
    savedAt: remote.updated_at,
  }

  const keep = async (side: 'local' | 'remote') => {
    setBusy(true)
    await settleConflict(conflict.id, side)
    setBusy(false)
  }
  const newer = remoteNewer ? 'remote' : 'local'
  const older = remoteNewer ? 'local' : 'remote'

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) useAccountStore.setState((s) => ({ conflicts: s.conflicts.slice(1) }))
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Carreira com {local.clubName} em dois aparelhos</DialogTitle>
          <DialogDescription>
            Ela foi jogada aqui e em outro aparelho desde a última sincronização. Escolha qual
            versão fica; a outra é substituída.
          </DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2 text-sm">
          {[here, there].map((side) => (
            <li key={side.where} className="rounded-md border p-2">
              <span className="font-semibold">{side.where}</span>: {side.progress}
              {side.savedAt === Math.max(here.savedAt, there.savedAt) && (
                <span className="ml-1 text-xs text-primary">(mais recente)</span>
              )}
              <span className="block text-xs text-muted-foreground">
                salvo em {savedAt.format(side.savedAt)}
              </span>
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" disabled={busy} onClick={() => keep(older)}>
            Ficar com a {older === 'local' ? 'deste aparelho' : 'da nuvem'}
          </Button>
          <Button disabled={busy} onClick={() => keep(newer)}>
            Ficar com a mais recente
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
