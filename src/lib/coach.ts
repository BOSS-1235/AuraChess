import { Chess } from 'chess.js'
import { ApiError } from './api'

export type Verdict = 'best' | 'good' | 'inaccuracy' | 'mistake' | 'blunder'
export type Persona = 'elena' | 'marcus' | 'ada'
export type Guidance = 'move' | 'ideas'
export type Phase = 'opening' | 'middlegame' | 'endgame'

export const PERSONAS: Record<Persona, { name: string; blurb: string }> = {
  elena: { name: 'Coach Elena', blurb: 'Patient, teaches fundamentals' },
  marcus: { name: 'Coach Marcus', blurb: 'Energetic, loves tactics' },
  ada: { name: 'Coach Ada', blurb: 'Calm, explains the logic' }
}

export interface CoachFacts {
  studentLastMove: string | null
  verdict: Verdict | null
  pawnsLost: number | null
  betterMove: string | null
  opponentReply: string | null
  recommendedNow: string | null
  evalPawns: number | null
  phase: Phase
}

/** Judge the student's move by how much evaluation it gave up compared with the engine's best. */
export function judge(playedSan: string, bestSan: string | null, evalBeforeCp: number, evalAfterCp: number): { verdict: Verdict; lossCp: number } {
  // The student plays White, so a drop in the White-perspective score is the loss.
  const lossCp = Math.max(0, evalBeforeCp - evalAfterCp)
  if (bestSan && playedSan === bestSan) return { verdict: 'best', lossCp: 0 }
  if (lossCp <= 40) return { verdict: 'good', lossCp }
  if (lossCp <= 110) return { verdict: 'inaccuracy', lossCp }
  if (lossCp <= 260) return { verdict: 'mistake', lossCp }
  return { verdict: 'blunder', lossCp }
}

export function gamePhase(fen: string, plies: number): Phase {
  const board = fen.split(' ')[0]
  const minors = (board.match(/[nbrqNBRQ]/g) ?? []).length
  if (minors <= 4) return 'endgame'
  return plies < 20 ? 'opening' : 'middlegame'
}

export function isLegalFen(fen: string): boolean {
  try {
    new Chess(fen)
    return true
  } catch {
    return false
  }
}

export interface CoachRequest {
  fen: string
  event: 'turn' | 'question'
  persona: Persona
  guidance: Guidance
  provider?: 'gemini' | 'groq'
  history: string[]
  question?: string
  facts: CoachFacts
}

/** Streams the coach's reply. Calls onText with the growing text; resolves with the final text. */
export async function streamCoach(req: CoachRequest, onText: (text: string) => void, signal?: AbortSignal): Promise<string> {
  let res: Response
  try {
    res = await fetch('/api/ai/coach', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(req),
      signal
    })
  } catch (err) {
    if ((err as Error).name === 'AbortError') throw err
    throw new ApiError('Can\u2019t reach the coach.', 0)
  }
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}))
    throw new ApiError((data as { error?: string }).error ?? 'The coach is unavailable.', res.status)
  }
  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    text += decoder.decode(value, { stream: true })
    onText(text)
  }
  return text.trim()
}

// ---- Built-in coach: works offline, with no API key, and for guests ------------

const PRINCIPLE: Record<Phase, string> = {
  opening: 'In the opening, fight for the center, develop your knights and bishops, and castle early.',
  middlegame: 'In the middlegame, keep your king safe, improve your worst-placed piece, and look for targets.',
  endgame: 'In the endgame, activate your king and push your passed pawns.'
}

const REACTION: Record<Verdict, string> = {
  best: 'Excellent — that was the engine\u2019s top choice.',
  good: 'Solid move.',
  inaccuracy: 'That\u2019s a small slip — playable, but there was better.',
  mistake: 'That one cost you something — let\u2019s tighten up.',
  blunder: 'Careful — that gave up a lot. Don\u2019t worry, look for the safest way to fight back.'
}

export function fallbackCoach(f: CoachFacts, guidance: Guidance, question?: string): string {
  if (question) {
    return `Good question. ${PRINCIPLE[f.phase]} ${f.recommendedNow && guidance === 'move' ? `Right now, ${f.recommendedNow} is the engine\u2019s suggestion.` : ''}`.trim()
  }
  const parts: string[] = []
  if (f.studentLastMove && f.verdict) {
    parts.push(REACTION[f.verdict])
    if ((f.verdict === 'inaccuracy' || f.verdict === 'mistake' || f.verdict === 'blunder') && f.betterMove && guidance === 'move') {
      parts.push(`${f.betterMove} was stronger.`)
    }
  } else {
    parts.push('Welcome! I\u2019m Black — let\u2019s play.')
  }
  parts.push(
    guidance === 'move' && f.recommendedNow
      ? `Now I\u2019d play ${f.recommendedNow}. ${PRINCIPLE[f.phase]}`
      : PRINCIPLE[f.phase]
  )
  return parts.join(' ')
}
