import { useState } from 'react'
import { PlayIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { playRoomRound } from '../../cloud/draft.ts'
import { confirm, type ConfirmRequest } from '../confirm.ts'

/** The owner's button that starts the league or plays its next round on the server. */
export function PlayRoundButton(props: {
  room: number
  label: string
  onPlayed: () => Promise<void>
  /** Asked first, when playing now leaves someone out. */
  confirm?: ConfirmRequest
}) {
  const [busy, setBusy] = useState(false)
  const play = async () => {
    if (props.confirm && !(await confirm(props.confirm))) return
    setBusy(true)
    try {
      await playRoomRound(props.room)
      await props.onPlayed()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Button onClick={play} disabled={busy}>
      <PlayIcon />
      {busy ? 'Jogando…' : props.label}
    </Button>
  )
}
