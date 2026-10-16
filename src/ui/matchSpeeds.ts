/** Milliseconds per minute in text only, and per shortest play on the pitch. */
export const SPEEDS = { Normal: 200, Rápido: 50 } as const
export const PLAY_SPEEDS = { Normal: 650, Rápido: 300 } as const
export type Speed = keyof typeof SPEEDS
