import { useState } from 'react'
import { toast } from 'sonner'
import { confirm } from './confirm.ts'

/**
 * Pack actions report in a toast; the warnings an import leaves behind (rows
 * skipped, names cut) stay on the page, where there is room to read them.
 */
export function usePackMessage() {
  const [warnings, setWarnings] = useState<string[]>()
  return {
    warnings,
    show: (message: string, warnings?: string[]) => {
      toast.success(message)
      setWarnings(warnings)
    },
    fail: (error: string) => {
      toast.error(error)
      setWarnings(undefined)
    },
  }
}

/** Asks before a pack replaces the one already there. */
export const confirmReplace = (description: string) =>
  confirm({ title: 'Substituir pacote', description, action: 'Substituir' })
