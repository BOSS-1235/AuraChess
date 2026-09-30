/** Standard FIDE-style Elo update — same formula used in the Android app. */
export function calculateNewRating(
  currentRating: number,
  opponentRating: number,
  actualScore: 0 | 0.5 | 1,
  kFactor = 32
): { newRating: number; change: number } {
  const expectedScore = 1 / (1 + Math.pow(10, (opponentRating - currentRating) / 400))
  const change = Math.round(kFactor * (actualScore - expectedScore))
  const newRating = Math.max(100, currentRating + change)
  return { newRating, change: newRating - currentRating }
}
