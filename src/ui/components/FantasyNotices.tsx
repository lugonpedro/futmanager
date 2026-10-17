import { useEffect, useState } from 'react'
import { BellIcon, BellOffIcon } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  disablePush,
  loadPushPrefs,
  pushSupport,
  savePushPrefs,
  type PushPrefs,
} from '../../cloud/push.ts'

const CHOICES: { key: keyof PushPrefs; label: string }[] = [
  { key: 'market', label: 'Mercado fechando, se você ainda não mexeu no time' },
  { key: 'rounds', label: 'Rodada jogada, com os pontos do seu time' },
]

/** Turns the game's push notifications on or off for this browser. */
export function FantasyNotices() {
  const [support] = useState(pushSupport)
  const [prefs, setPrefs] = useState<PushPrefs>({ market: true, rounds: true })
  // Undefined while loading; then whether this browser is subscribed.
  const [on, setOn] = useState<boolean>()
  const [busy, setBusy] = useState(false)
  const blocked = support === 'sim' && Notification.permission === 'denied'

  useEffect(() => {
    if (support !== 'sim') return
    let live = true
    loadPushPrefs()
      .then((saved) => {
        if (!live) return
        if (saved) setPrefs(saved)
        setOn(Boolean(saved))
      })
      .catch(() => live && setOn(false))
    return () => {
      live = false
    }
  }, [support])

  if (support === 'nao') return null

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    try {
      await action()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error))
    } finally {
      setBusy(false)
    }
  }

  const choose = (key: keyof PushPrefs, value: boolean) => {
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    if (on) void run(() => savePushPrefs(next))
  }

  const turnOn = () =>
    run(async () => {
      await savePushPrefs(prefs)
      setOn(true)
      toast.success('Avisos ligados neste aparelho.')
    })

  const turnOff = () =>
    run(async () => {
      await disablePush()
      setOn(false)
    })

  return (
    <Card>
      <CardHeader>
        <CardTitle>Avisos</CardTitle>
        <CardDescription>
          Notificações no celular ou no computador, mesmo com o jogo fechado.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3 text-sm">
        {support === 'instalar' ? (
          <p className="text-muted-foreground">
            No iPhone e no iPad, os avisos chegam depois de pôr o onzemestre na tela de início:
            toque em Compartilhar e depois em “Adicionar à Tela de Início”, e abra o jogo por lá.
          </p>
        ) : blocked ? (
          <p className="text-muted-foreground">
            As notificações estão bloqueadas para este site. Libere nas configurações do navegador e
            volte aqui.
          </p>
        ) : on === undefined ? (
          <p className="text-muted-foreground">Carregando…</p>
        ) : (
          <>
            {CHOICES.map(({ key, label }) => (
              <label key={key} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={prefs[key]}
                  disabled={busy}
                  onChange={(e) => choose(key, e.target.checked)}
                />
                {label}
              </label>
            ))}
            <div>
              {on ? (
                <Button size="sm" variant="outline" disabled={busy} onClick={turnOff}>
                  <BellOffIcon />
                  Desligar neste aparelho
                </Button>
              ) : (
                <Button
                  size="sm"
                  disabled={busy || (!prefs.market && !prefs.rounds)}
                  onClick={turnOn}
                >
                  <BellIcon />
                  Ligar avisos
                </Button>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  )
}
