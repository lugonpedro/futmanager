import type { GameState } from '../engine/model/types.ts'

/**
 * A career as gzip-compressed JSON in base64, the form it takes in the cloud:
 * about a seventh of the plain JSON.
 */
export async function packGame(game: GameState): Promise<string> {
  const stream = new Blob([JSON.stringify(game)])
    .stream()
    .pipeThrough(new CompressionStream('gzip'))
  const bytes = new Uint8Array(await new Response(stream).arrayBuffer())
  let binary = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(binary)
}

/** Reverses packGame(). The game may need upgradeGame() if an older version saved it. */
export async function unpackGame(data: string): Promise<GameState> {
  const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))
  return JSON.parse(await new Response(stream).text()) as GameState
}
