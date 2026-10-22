import { useEffect, useState } from 'react'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { loadTeamSheet } from '../../cloud/roomLeague.ts'
import type { Room } from '../../cloud/rooms.ts'
import type { Player } from '../../engine/model/types.ts'
import { primePlayer } from '../../engine/room/prime.ts'
import type { TeamSheet } from '../../engine/room/summary.ts'
import type { DraftPlayer } from '../draft.ts'
import { sheetAvailability } from '../roomLeague.ts'
import { usePackWorld } from '../usePackWorld.ts'
import { PlayerCard } from './PlayerCard.tsx'
import { FormArrow } from './PlayerSheetView.tsx'
import { AvailabilityTags } from './PlayerStatus.tsx'

/**
 * A trade side by side before saying yes: the cards of who comes and of who
 * goes, as they play the league now (energy and form included once a round
 * was played), and the overall each side adds up to.
 */
export function TradeCompare(props: {
  room: Room
  /** The player's place, and the other team's. */
  mine: number
  partner: number
  partnerName: string
  /** The ids that come to the player, and those that go. */
  receive: readonly string[]
  give: readonly string[]
  drafted: ReadonlyMap<string, DraftPlayer>
  onClose: () => void
}) {
  const { room, mine, partner, drafted } = props
  const world = usePackWorld(room.pack)
  const [sheets, setSheets] = useState<{ mine?: TeamSheet; partner?: TeamSheet }>()

  useEffect(() => {
    let live = true
    Promise.all([loadTeamSheet(room.id, mine), loadTeamSheet(room.id, partner)])
      .then(([own, other]) => live && setSheets({ mine: own, partner: other }))
      .catch(() => live && setSheets({}))
    return () => {
      live = false
    }
  }, [room.id, mine, partner])

  // The league's player when there is one; before the first round, the card as drafted.
  const playerOf = (id: string, sheet?: TeamSheet): Player | undefined => {
    const inSheet = sheet?.players.find((p) => p.id === id)
    if (inSheet) return inSheet
    const full = world?.players[id]
    const card = drafted.get(id)
    if (!full || !card) return undefined
    return { ...primePlayer(full, card.prime ?? 0), name: card.name, overall: card.overall }
  }
  const side = (ids: readonly string[], sheet?: TeamSheet) =>
    ids.map((id) => ({
      id,
      player: playerOf(id, sheet),
      sheet: sheet?.players.some((p) => p.id === id) ? sheet : undefined,
    }))
  const coming = side(props.receive, sheets?.partner)
  const going = side(props.give, sheets?.mine)
  const total = (list: typeof coming) =>
    list.reduce(
      (sum, { id, player }) => sum + (player?.overall ?? drafted.get(id)?.overall ?? 0),
      0,
    )
  const diff = total(coming) - total(going)

  return (
    <Dialog open onOpenChange={(on) => !on && props.onClose()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogTitle>Comparar a troca</DialogTitle>
        <DialogDescription>
          Geral somada: você recebe {total(coming)} e dá {total(going)} (
          {diff > 0 ? `+${diff}` : diff}).
        </DialogDescription>
        {!sheets || !world ? (
          <p className="text-sm text-muted-foreground">Carregando as cartas…</p>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Column
              title={`Você recebe de ${props.partnerName}`}
              cards={coming}
              drafted={drafted}
            />
            <Column title="Você dá" cards={going} drafted={drafted} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}

function Column(props: {
  title: string
  cards: { id: string; player?: Player; sheet?: TeamSheet }[]
  drafted: ReadonlyMap<string, DraftPlayer>
}) {
  return (
    <section className="flex min-w-0 flex-col items-center gap-3">
      <h3 className="min-h-10 text-center text-sm font-semibold">{props.title}</h3>
      {props.cards.map(({ id, player, sheet }) =>
        player ? (
          <div key={id} className="flex flex-col items-center gap-1">
            <PlayerCard
              player={player}
              tier={props.drafted.get(id)?.prime ? 'prime' : undefined}
              className="[zoom:0.72] sm:[zoom:1]"
            />
            {sheet && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground">
                <span title="Energia">{Math.round(sheet.condition[id] ?? 100)}%</span>
                <FormArrow form={sheet.form[id] ?? 0} />
                <AvailabilityTags {...sheetAvailability(sheet, id)} />
              </p>
            )}
          </div>
        ) : (
          <p key={id} className="text-sm">
            {props.drafted.get(id)?.name ?? '?'}
          </p>
        ),
      )}
    </section>
  )
}
