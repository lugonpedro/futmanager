import type { GameState } from '../engine/model/types.ts'

/** Any JSON value gzip-compressed in base64: about a seventh of the plain JSON. */
export async function packJson(value: unknown): Promise<string> {
  const stream = new Blob([JSON.stringify(value)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** Reverses packJson(). */
export async function unpackJson<T>(data: string): Promise<T> {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return JSON.parse(await new Response(stream).text()) as T
}

/** A career in the form it takes in the cloud. */
export const packGame = (game: GameState): Promise<string> => packJson(game)

/** Reverses packGame(). The game may need upgradeGame() if an older version saved it. */
export const unpackGame = (data: string): Promise<GameState> => unpackJson<GameState>(data)
