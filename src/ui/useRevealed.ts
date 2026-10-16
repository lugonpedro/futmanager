import { useEffect, useRef, useState } from 'react'

/**
 * Holds back a value that changes with each minute until `delay` has passed,
 * so numbers beside the pitch move when the play is seen, not when it starts.
 * Changes within the same minute (a substitution) show at once.
 */
export function useRevealed<T>(value: T, minute: number, delay: number): T {
  const latest = useRef(value)
  const [shown, setShown] = useState({ minute, value })
  useEffect(() => {
    latest.current = value
  })
  useEffect(() => {
    if (delay <= 0) return
    const timer = setTimeout(() => setShown({ minute, value: latest.current }), delay)
    return () => clearTimeout(timer)
  }, [minute, delay])
  return delay <= 0 || shown.minute === minute ? value : shown.value
}
