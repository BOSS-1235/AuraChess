import { useMemo, useState } from 'react'
import type { Chess, Square } from 'chess.js'

// Filled glyphs for both sides (U+FE0E forces text rendering, never emoji);
// colour, not outline vs. fill, tells the sides apart.
const FILLED: Record<string, string> = { p: '\u265F', n: '\u265E', b: '\u265D', r: '\u265C', q: '\u265B', k: '\u265A' }
const glyph = (_color: string, type: string) => FILLED[type] + '\uFE0E'

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']

interface ChessBoardProps {
  game: Chess
  orientation?: 'white' | 'black'
  onMove: (from: Square, to: Square, promotion?: string) => void
  disabled?: boolean
  lastMove?: { from: string; to: string } | null
}

export function ChessBoard({ game, orientation = 'white', onMove, disabled, lastMove }: ChessBoardProps) {
  const [selected, setSelected] = useState<Square | null>(null)
  const [pendingPromotion, setPendingPromotion] = useState<{ from: Square; to: Square } | null>(null)

  const ranks = orientation === 'white' ? [8, 7, 6, 5, 4, 3, 2, 1] : [1, 2, 3, 4, 5, 6, 7, 8]
  const files = orientation === 'white' ? FILES : [...FILES].reverse()

  const legalTargets = useMemo(() => {
    if (!selected) return new Set<string>()
    return new Set(game.moves({ square: selected, verbose: true }).map((m) => m.to))
  }, [game, selected])

  const isCheck = game.inCheck()
  const board = game.board()

  function pieceAt(square: Square) {
    const file = square.charCodeAt(0) - 'a'.charCodeAt(0)
    const rank = 8 - parseInt(square[1], 10)
    return board[rank][file]
  }

  function handleSquareClick(square: Square) {
    if (disabled) return

    if (selected && legalTargets.has(square)) {
      const piece = pieceAt(selected)
      const isPromotion = piece?.type === 'p' && (square[1] === '8' || square[1] === '1')
      if (isPromotion) {
        setPendingPromotion({ from: selected, to: square })
      } else {
        onMove(selected, square)
      }
      setSelected(null)
      return
    }

    const piece = pieceAt(square)
    if (piece && piece.color === (game.turn() === 'w' ? 'w' : 'b') && piece.color === game.turn()) {
      setSelected(square)
    } else {
      setSelected(null)
    }
  }

  return (
    <div className="relative inline-block select-none">
      <div
        className="grid overflow-hidden rounded-md border border-border shadow-sm"
        style={{ gridTemplateColumns: 'repeat(8, minmax(0, 1fr))', gridTemplateRows: 'repeat(8, minmax(0, 1fr))', width: 'min(88vw, 480px)', aspectRatio: '1 / 1' }}
      >
        {ranks.flatMap((rank) =>
          files.map((file) => {
            const square = `${file}${rank}` as Square
            const piece = pieceAt(square)
            const isLight = (FILES.indexOf(file) + rank) % 2 !== 0
            const isSelected = selected === square
            const isTarget = legalTargets.has(square)
            const isLastMove = lastMove && (lastMove.from === square || lastMove.to === square)
            const isKingInCheck = isCheck && piece?.type === 'k' && piece.color === game.turn()

            return (
              <button
                key={square}
                onClick={() => handleSquareClick(square)}
                className="relative flex items-center justify-center text-[clamp(1.6rem,7vw,2.9rem)] leading-none overflow-hidden aspect-square"
                style={{
                  backgroundColor: isLight ? 'rgb(var(--board-light))' : 'rgb(var(--board-dark))',
                  cursor: disabled ? 'default' : 'pointer'
                }}
              >
                {isLastMove && <span className="absolute inset-0 bg-accent/15" />}
                {isKingInCheck && <span className="absolute inset-0 bg-bad/25" />}
                {isSelected && <span className="absolute inset-0 bg-accent/25" />}
                {isTarget && !piece && <span className="absolute h-[28%] w-[28%] rounded-full bg-accent/40" />}
                {isTarget && piece && <span className="absolute inset-1 rounded-full border-[3px] border-accent/50" />}
                {piece && (
                  <span
                    className="relative"
                    style={
                      piece.color === 'w'
                        ? { color: '#FBF8F1', textShadow: '0 0 1px #000, 0 0 2px #000, 0 1px 2px rgba(0,0,0,.5)' }
                        : { color: '#1B1A17', textShadow: '0 0 1px rgba(255,255,255,.95), 0 0 2px rgba(255,255,255,.4)' }
                    }
                  >
                    {glyph(piece.color, piece.type)}
                  </span>
                )}
              </button>
            )
          })
        )}
      </div>

      {pendingPromotion && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg/90">
          <div className="flex gap-2 rounded-md border border-border bg-surface p-3">
            {['q', 'r', 'b', 'n'].map((p) => (
              <button
                key={p}
                onClick={() => {
                  onMove(pendingPromotion.from, pendingPromotion.to, p)
                  setPendingPromotion(null)
                }}
                className="flex h-12 w-12 items-center justify-center rounded text-2xl hover:bg-border/40"
              >
                {glyph(game.turn(), p)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
