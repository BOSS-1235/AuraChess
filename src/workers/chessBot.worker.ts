import { findBestMove } from '../lib/engineCore'

self.onmessage = (event: MessageEvent<{ fen: string; depth: number; timeMs: number; randomness: number }>) => {
  const { fen, depth, timeMs, randomness } = event.data
  ;(self as unknown as Worker).postMessage({ move: findBestMove(fen, depth, timeMs, randomness) })
}
