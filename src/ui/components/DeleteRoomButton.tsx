import { Trash2Icon } from 'lucide-react'
import { useNavigate } from 'react-router'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { deleteRoom, type Room } from '../../cloud/rooms.ts'
import { confirm } from '../confirm.ts'

const messageOf = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** The owner's way to delete the room once the draft started: it ends for everyone in it. */
export function DeleteRoomButton(props: { room: Room }) {
  const { room } = props
  const navigate = useNavigate()
  const remove = async () => {
    const ok = await confirm({
      title: 'Apagar a sala?',
      description:
        room.status === 'encerrada'
          ? 'A sala e a liga que acabou somem para todo mundo que entrou nela.'
          : `${room.status === 'draft' ? 'O draft' : 'A liga'} acaba na hora e a sala some para todo mundo que entrou nela. Não dá para desfazer.`,
      action: 'Apagar sala',
      destructive: true,
    })
    if (!ok) return
    try {
      await deleteRoom(room.id)
      navigate('/salas')
    } catch (error) {
      toast.error(messageOf(error))
    }
  }
  return (
    <Button variant="outline" className="self-start text-destructive" onClick={remove}>
      <Trash2Icon />
      Apagar sala
    </Button>
  )
}
