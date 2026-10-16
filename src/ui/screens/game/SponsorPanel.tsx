import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import {
  declineSecondary,
  signSecondary,
  signSponsor,
  SLOTS,
  userSponsorPayment,
} from '../../../engine/finance/sponsors.ts'
import type { SecondaryDeal, SponsorDeal, SponsorSlot } from '../../../engine/model/types.ts'
import { useGame, useGameStore } from '../../../store/game.ts'
import { confirm } from '../../confirm.ts'
import {
  formatDayMonth,
  formatMoney,
  SPONSOR_SLOT_NAMES,
  SPONSOR_STYLE_NAMES,
  sponsorGoalText,
  sponsorSeasons,
  sponsorSlotPlace,
} from '../../format.ts'

/** The shirt sponsor and the smaller ones around it: deals in force and offers to answer. */
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

      <SecondarySponsors />
    </div>
  )
}

/** One card per slot on the kit: the sponsor there, an offer for it, or nothing yet. */
function SecondarySponsors() {
  const game = useGame()
  const setGame = useGameStore((s) => s.setGame)
  const { secondary, secondaryOffers } = game.sponsorship

  const sign = (offer: SecondaryDeal) => {
    setGame(signSecondary(useGameStore.getState().game!, offer.id))
    toast.success(`${offer.company} vai patrocinar ${sponsorSlotPlace(offer.slot)}.`)
  }
  const decline = (offer: SecondaryDeal) => {
    setGame(declineSecondary(useGameStore.getState().game!, offer.id))
    toast(`Proposta da ${offer.company} recusada.`)
  }

  const slotCard = (slot: SponsorSlot) => {
    const deal = secondary.find((d) => d.slot === slot)
    const offers = secondaryOffers.filter((o) => o.slot === slot)
    return (
      <Card key={slot} className="gap-2 px-4">
        <h3 className="font-semibold capitalize">{SPONSOR_SLOT_NAMES[slot]}</h3>
        {deal ? (
          <>
            <p className="text-sm">
              <strong>{deal.company}</strong>:{' '}
              <strong className="tabular-nums">{formatMoney(deal.monthly)}</strong> por mês.
            </p>
            <p className="text-sm text-muted-foreground">Contrato {sponsorSeasons(deal)}.</p>
          </>
        ) : offers.length > 0 ? (
          offers.map((offer) => (
            <div key={offer.id} className="flex flex-col gap-2">
              <p className="text-sm">
                <strong>{offer.company}</strong> oferece{' '}
                <strong className="tabular-nums">{formatMoney(offer.monthly)}</strong> por mês (
                {sponsorSeasons(offer)}).
              </p>
              {offer.expires && (
                <p className="text-sm text-muted-foreground">
                  Vale até {formatDayMonth(offer.expires)}.
                </p>
              )}
              <div className="flex gap-2">
                <Button size="sm" onClick={() => sign(offer)}>
                  Aceitar
                </Button>
                <Button size="sm" variant="outline" onClick={() => decline(offer)}>
                  Recusar
                </Button>
              </div>
            </div>
          ))
        ) : (
          <p className="text-sm text-muted-foreground">
            Espaço livre. Propostas podem chegar no começo de cada mês.
          </p>
        )}
      </Card>
    )
  }

  return (
    <section className="flex flex-col gap-3">
      <div>
        <h3 className="font-semibold">Outros patrocinadores</h3>
        <p className="text-sm text-muted-foreground">
          Além do master, empresas menores pagam para aparecer na manga, nas costas e no calção.
          Cada uma paga um valor fixo por mês, sem meta, e sai se o time for rebaixado.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">{SLOTS.map(slotCard)}</div>
    </section>
  )
}
