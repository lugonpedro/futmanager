import { StarIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { Player } from '../../engine/model/types.ts'
import { toggleFavorite } from '../../engine/transfer/market.ts'
import { useGame, useGameStore } from '../../store/game.ts'

/** A star by a player's name that puts him on the favorites or takes him off. */
export function FavoriteStar(props: { player: Player; className?: string }) {
  const game = useGame()
  const setGame = useGameStore((s) => s.setGame)
  const { player } = props
  const starred = game.favorites.includes(player.id)
  const label = starred ? `Tirar ${player.name} dos favoritos` : `Favoritar ${player.name}`
  const keep = (e: { stopPropagation: () => void }) => e.stopPropagation()
  return (
    <Button
      variant="ghost"
      size="icon"
      // A finger needs a bigger target than a cursor.
      className={cn('size-8 sm:size-6', props.className)}
      aria-label={label}
      aria-pressed={starred}
      title={label}
      onClick={(e) => {
        e.stopPropagation()
        setGame(toggleFavorite(game, player.id))
      }}
      onMouseDown={keep}
      onTouchStart={keep}
    >
      <StarIcon
        className={cn(
          starred ? 'fill-yellow-400 text-yellow-500' : 'text-muted-foreground opacity-60',
        )}
      />
    </Button>
  )
}
