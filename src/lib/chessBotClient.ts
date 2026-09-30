import { findBestMove, type EngineResult } from './engineCore'
import BotWorker from '../workers/chessBot.worker?worker&inline'

export type BotMove = EngineResult

/**
 * Talks to chessBot.worker.ts. A fresh worker per request keeps things
 * simple and avoids any risk of stale state between games; a full game's
 * worth of instantiations is inexpensive next to the search itself.
 */
export function requestBotMove(fen: string, difficulty: BotDifficulty, opts?: { timeMs?: number; randomness?: number }): Promise<BotMove | null> {
  const base = BOT_DIFFICULTY_CONFIG[difficulty]
  const c = { ...base, ...opts }

  // Same search on the main thread — only used if a host blocks Web Workers.
  const fallback = () =>
    new Promise<BotMove | null>((resolve) => setTimeout(() => resolve(findBestMove(fen, c.depth, c.timeMs, c.randomness)), 0))

  return new Promise((resolve) => {
    let worker: Worker
    try {
      worker = new BotWorker()
    } catch {
      return void fallback().then(resolve)
    }
    const timeout = setTimeout(() => {
      worker.terminate()
      void fallback().then(resolve)
    }, 5_000)
    worker.onmessage = (event: MessageEvent<{ move: BotMove | null }>) => {
      clearTimeout(timeout)
      resolve(event.data.move)
      worker.terminate()
    }
    worker.onerror = () => {
      clearTimeout(timeout)
      worker.terminate()
      void fallback().then(resolve)
    }
    worker.postMessage({ fen, depth: c.depth, timeMs: c.timeMs, randomness: c.randomness })
  })
}

export type BotDifficulty = 'easy' | 'medium' | 'hard'

export const BOT_DIFFICULTY_CONFIG: Record<
  BotDifficulty,
  { label: string; depth: number; timeMs: number; randomness: number; approxRating: number }
> = {
  easy: { label: 'Easy', depth: 2, timeMs: 200, randomness: 0.3, approxRating: 800 },
  medium: { label: 'Medium', depth: 4, timeMs: 450, randomness: 0, approxRating: 1200 },
  hard: { label: 'Hard', depth: 6, timeMs: 900, randomness: 0, approxRating: 1600 }
}
