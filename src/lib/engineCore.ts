import { Chess } from 'chess.js'

/**
 * The actual chess-playing opponent. Deliberately a small local alpha-beta
 * search, NOT an LLM call — a language model is the wrong tool for "make a
 * legal, reasonable move right now": it's slow, it hallucinates illegal
 * moves, and it costs an API call per ply. This runs in a Web Worker so
 * even a deeper search never freezes the page; the main thread just waits
 * on a message instead of blocking.
 */

const PIECE_VALUES: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 }

// Coarse piece-square tables (white's perspective; mirrored for black) —
// enough to make the bot prefer center control and development without
// needing a large opening book.
const PAWN_TABLE = [
  0, 0, 0, 0, 0, 0, 0, 0,
  50, 50, 50, 50, 50, 50, 50, 50,
  10, 10, 20, 30, 30, 20, 10, 10,
  5, 5, 10, 25, 25, 10, 5, 5,
  0, 0, 0, 20, 20, 0, 0, 0,
  5, -5, -10, 0, 0, -10, -5, 5,
  5, 10, 10, -20, -20, 10, 10, 5,
  0, 0, 0, 0, 0, 0, 0, 0
]
const KNIGHT_TABLE = [
  -50, -40, -30, -30, -30, -30, -40, -50,
  -40, -20, 0, 0, 0, 0, -20, -40,
  -30, 0, 10, 15, 15, 10, 0, -30,
  -30, 5, 15, 20, 20, 15, 5, -30,
  -30, 0, 15, 20, 20, 15, 0, -30,
  -30, 5, 10, 15, 15, 10, 5, -30,
  -40, -20, 0, 5, 5, 0, -20, -40,
  -50, -40, -30, -30, -30, -30, -40, -50
]

function squareIndex(file: number, rank: number) {
  return rank * 8 + file
}

function evaluateBoard(chess: Chess): number {
  if (chess.isCheckmate()) return chess.turn() === 'w' ? -100000 : 100000
  if (chess.isDraw() || chess.isStalemate() || chess.isThreefoldRepetition()) return 0

  let score = 0
  const board = chess.board()
  for (let rank = 0; rank < 8; rank++) {
    for (let file = 0; file < 8; file++) {
      const piece = board[rank][file]
      if (!piece) continue
      const value = PIECE_VALUES[piece.type]
      const idx = piece.color === 'w' ? squareIndex(file, 7 - rank) : squareIndex(file, rank)
      let positional = 0
      if (piece.type === 'p') positional = PAWN_TABLE[idx]
      if (piece.type === 'n') positional = KNIGHT_TABLE[idx]
      const total = value + positional
      score += piece.color === 'w' ? total : -total
    }
  }
  return score
}

function orderMoves(chess: Chess) {
  // Captures first — dramatically improves alpha-beta pruning efficiency.
  return chess.moves({ verbose: true }).sort((a, b) => (b.captured ? 1 : 0) - (a.captured ? 1 : 0))
}

class TimeUp extends Error {}
let deadline = Infinity

function alphaBeta(chess: Chess, depth: number, alpha: number, beta: number, maximizing: boolean): number {
  if (performance.now() > deadline) throw new TimeUp()
  if (depth === 0 || chess.isGameOver()) return evaluateBoard(chess)

  let best = maximizing ? -Infinity : Infinity
  for (const move of orderMoves(chess)) {
    chess.move(move)
    const score = alphaBeta(chess, depth - 1, alpha, beta, !maximizing)
    chess.undo()
    if (maximizing) {
      best = Math.max(best, score)
      alpha = Math.max(alpha, best)
    } else {
      best = Math.min(best, score)
      beta = Math.min(beta, best)
    }
    if (beta <= alpha) break
  }
  return best
}

function searchRoot(chess: Chess, depth: number) {
  const maximizing = chess.turn() === 'w'
  let bestMove: ReturnType<Chess['moves']>[number] | null = null
  let bestScore = maximizing ? -Infinity : Infinity
  for (const move of orderMoves(chess)) {
    chess.move(move)
    const score = alphaBeta(chess, depth - 1, -Infinity, Infinity, !maximizing)
    chess.undo()
    if (maximizing ? score > bestScore : score < bestScore) {
      bestScore = score
      bestMove = move
    }
  }
  return bestMove ? { move: bestMove, score: bestScore } : null
}

// Iterative deepening: always answer with the best move from the last
// *finished* depth, so the reply lands within the time budget in any position.
export interface EngineResult {
  from: string
  to: string
  promotion?: string
  san: string
  /** Centipawns from White's point of view (positive = White is better). Mates are clamped to +/-2000. */
  score: number
}

const clampScore = (n: number) => Math.max(-2000, Math.min(2000, n))

export function findBestMove(fen: string, maxDepth: number, timeMs: number, randomness: number): EngineResult | null {
  const chess = new Chess(fen)
  const legal = chess.moves({ verbose: true })
  if (legal.length === 0) return null
  const toResult = (m: (typeof legal)[number], score: number): EngineResult => ({
    from: m.from,
    to: m.to,
    promotion: m.promotion,
    san: m.san,
    score: clampScore(score)
  })
  if (randomness > 0 && Math.random() < randomness) {
    return toResult(legal[Math.floor(Math.random() * legal.length)], evaluateBoard(chess))
  }
  deadline = performance.now() + timeMs
  let best = legal[0]
  let bestScore = evaluateBoard(chess)
  for (let d = 1; d <= maxDepth; d++) {
    try {
      const r = searchRoot(chess, d)
      if (r) {
        best = r.move
        bestScore = r.score
      }
    } catch (e) {
      if (e instanceof TimeUp) break
      throw e
    }
  }
  return toResult(best, bestScore)
}
