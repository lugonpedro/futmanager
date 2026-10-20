import { create } from 'zustand'

export type ConfirmRequest = {
  title: string
  description: string
  /** Label of the button that goes ahead. */
  action: string
  /** Label of the button that doesn't; "Cancelar" by default. */
  cancel?: string
  /** Red button, for what can't be undone. */
  destructive?: boolean
  /** Offers "Não perguntar de novo", remembered in this browser under this key. */
  rememberKey?: string
}

type Pending = ConfirmRequest & { resolve: (ok: boolean) => void }

export const useConfirmStore = create<{ pending?: Pending }>()(() => ({}))

const SKIP_PREFIX = 'futmanager-sem-confirmar-'

export function skipsConfirm(key: string): boolean {
  try {
    return localStorage.getItem(SKIP_PREFIX + key) === '1'
  } catch {
    return false
  }
}

export function setSkipsConfirm(key: string, skip: boolean) {
  try {
    if (skip) localStorage.setItem(SKIP_PREFIX + key, '1')
    else localStorage.removeItem(SKIP_PREFIX + key)
  } catch {
    // Without storage the question just keeps coming back.
  }
}

/**
 * Asks in a modal and resolves with the answer. Replaces window.confirm; a
 * question the player chose not to see again resolves true at once.
 */
export function confirm(request: ConfirmRequest): Promise<boolean> {
  if (request.rememberKey && skipsConfirm(request.rememberKey)) return Promise.resolve(true)
  useConfirmStore.getState().pending?.resolve(false)
  return new Promise((resolve) => useConfirmStore.setState({ pending: { ...request, resolve } }))
}

/** Settles the open question; `remember` stores "Não perguntar de novo". */
export function answerConfirm(ok: boolean, remember = false) {
  const pending = useConfirmStore.getState().pending
  if (!pending) return
  if (ok && remember && pending.rememberKey) setSkipsConfirm(pending.rememberKey, true)
  useConfirmStore.setState({ pending: undefined })
  pending.resolve(ok)
}
