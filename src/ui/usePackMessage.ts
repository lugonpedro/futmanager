import { useState } from 'react'

/** Holds the message and warnings an import or other pack action leaves behind. */
export function usePackMessage() {
  const [state, setState] = useState<{ message?: string; warnings?: string[] }>({})
  return {
    ...state,
    show: (message?: string, warnings?: string[]) => setState({ message, warnings }),
  }
}
