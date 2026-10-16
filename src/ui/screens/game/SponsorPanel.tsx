import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { signSponsor, userSponsorPayment } from '../../../engine/finance/sponsors.ts'
import type { SponsorDeal } from '../../../engine/model/types.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { confirm } from '../../confirm.ts'
import {
  formatDayMonth,
  formatMoney,
  SPONSOR_STYLE_NAMES,
  sponsorGoalText,
  sponsorSeasons,
} from '../../format.ts'

/** The shirt sponsor: the deal in force, or the offers to choose from. */
export function SponsorPanel() {
  const game = useGame()
  const setGame = useGameStore((s) => s.setGame)
  const { master, offers, deadline } = game.sponsorship
  const division = game.world.clubs[game.userClubId].division

  const sign = async (offer: SponsorDeal) => {
    const ok = await confirm({
      title: `Assinar com ${offer.company}?`,
      description: `${formatMoney(offer.monthly)} por mês (${sponsorSeasons(offer)}). As outras propostas são recusadas.`,
      action: 'Assinar',
    })
    if (!ok) return
    setGame(signSponsor(useGameStore.getState().game!, offer.id))
    toast.success(`${offer.company} é o novo patrocinador master.`)
  }

  return (
    <div className="flex flex-col gap-4">
      {master ? (
        <Card className="gap-2 px-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-semibold">Master: {master.company}</h3>
            <span className="text-sm text-muted-foreground">Contrato {sponsorSeasons(master)}</span>
          </div>
          <p className="text-sm">
            <strong className="tabular-nums">{formatMoney(master.monthly)}</strong> por mês
            {master.goal && master.bonus > 0 && (
              <>
                , mais <strong className="tabular-nums">{formatMoney(master.bonus)}</strong> se o
                time {sponsorGoalText(master.goal, division)} na temporada
              </>
            )}
            .
          </p>
          <p className="text-sm text-muted-foreground">
            Perder a meta não gera multa, só deixa o bônus de fora. O contrato acaba se o time for
            rebaixado, e novas propostas chegam quando ele termina.
          </p>
        </Card>
      ) : (
        <p className="text-sm">
          Sem patrocinador master, o clube recebe só patrocínios avulsos:{' '}
          <strong>{formatMoney(userSponsorPayment(game).amount)}</strong> por mês.
          {deadline && (
            <>
              {' '}
              Se você não escolher até {formatDayMonth(deadline)}, a diretoria assina a proposta
              segura.
            </>
          )}
        </p>
      )}

      {offers.length > 0 && (
        <div className="grid gap-3 md:grid-cols-3">
          {offers.map((offer) => (
            <Card key={offer.id} className="gap-2 px-4">
              <div className="flex items-center justify-between gap-2">
                <h3 className="font-semibold">{offer.company}</h3>
                <Badge variant={offer.style === 'ousada' ? 'default' : 'secondary'}>
                  {SPONSOR_STYLE_NAMES[offer.style]}
                </Badge>
              </div>
              <p className="text-lg font-bold tabular-nums">
                {formatMoney(offer.monthly)}
                <span className="text-sm font-normal text-muted-foreground"> por mês</span>
              </p>
              {offer.goal && (
                <p className="text-sm">
                  Bônus de <strong className="tabular-nums">{formatMoney(offer.bonus)}</strong> por
                  temporada em que o time {sponsorGoalText(offer.goal, division)}.
                </p>
              )}
              <p className="text-sm text-muted-foreground">Contrato {sponsorSeasons(offer)}.</p>
              <Button className="mt-auto self-start" onClick={() => sign(offer)}>
                Assinar
              </Button>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
