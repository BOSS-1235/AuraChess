import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Chess, type Square } from 'chess.js'
import { ChessBoard } from '../components/ChessBoard'
import { Button } from '../components/Button'
import { textInputClass } from '../components/PasswordInput'
import { BOT_DIFFICULTY_CONFIG, requestBotMove, type BotDifficulty } from '../lib/chessBotClient'
import { api, ApiError, type User } from '../lib/api'
import {
  PERSONAS, fallbackCoach, gamePhase, judge, streamCoach,
  type CoachFacts, type Guidance, type Persona
} from '../lib/coach'
import { useAuth } from '../context/AuthContext'

type Mode = 'coach' | 'engine' | 'pass'
interface Line { who: 'coach' | 'you'; text: string }
interface TurnAnalysis { bestSan: string; score: number }

const PREF_KEY = 'aurachess-coach-prefs'
function loadPrefs(): { persona: Persona; guidance: Guidance; speak: boolean } {
  try {
    return { persona: 'elena', guidance: 'move', speak: false, ...JSON.parse(localStorage.getItem(PREF_KEY) ?? '{}') }
  } catch {
    return { persona: 'elena', guidance: 'move', speak: false }
  }
}

export default function Play() {
  const { user, setUser } = useAuth()
  const gameRef = useRef(new Chess())
  const [, setTick] = useState(0)
  const rerender = useCallback(() => setTick((t) => t + 1), [])
  const genRef = useRef(0) // bumps on every new game so late async results are ignored

  const [mode, setMode] = useState<Mode>('coach')
  const [difficulty, setDifficulty] = useState<BotDifficulty>('easy')
  const [prefs, setPrefs] = useState(loadPrefs)
  const [providers, setProviders] = useState<string[]>([])
  const [provider, setProvider] = useState<'gemini' | 'groq' | undefined>()
  const [lastMove, setLastMove] = useState<{ from: string; to: string } | null>(null)
  const [thinking, setThinking] = useState(false)
  const [isOver, setIsOver] = useState(false)
  const [banner, setBanner] = useState<string | null>(null)
  const [lines, setLines] = useState<Line[]>([])
  const [coachBusy, setCoachBusy] = useState(false)
  const [question, setQuestion] = useState('')
  const turnRef = useRef<TurnAnalysis | null>(null)
  const factsRef = useRef<CoachFacts | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const transcriptEnd = useRef<HTMLDivElement>(null)

  const game = gameRef.current
  const coachOn = mode === 'coach'

  useEffect(() => {
    localStorage.setItem(PREF_KEY, JSON.stringify(prefs))
  }, [prefs])

  useEffect(() => {
    api<{ providers: string[] }>('/ai/providers').then((r) => {
      setProviders(r.providers)
      setProvider(r.providers[0] as 'gemini' | 'groq' | undefined)
    }).catch(() => undefined)
  }, [])

  // Never leave speech running when leaving the page or hiding the tab.
  useEffect(() => {
    const stop = () => window.speechSynthesis?.cancel()
    const onHide = () => document.hidden && stop()
    document.addEventListener('visibilitychange', onHide)
    return () => {
      document.removeEventListener('visibilitychange', onHide)
      stop()
      abortRef.current?.abort()
    }
  }, [])

  useEffect(() => {
    transcriptEnd.current?.scrollIntoView({ block: 'nearest' })
  }, [lines])

  const speak = useCallback((text: string) => {
    if (!prefs.speak || !window.speechSynthesis) return
    window.speechSynthesis.cancel()
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
  }, [prefs.speak])

  /** Ask the coach (AI if signed in and available, built-in otherwise) and stream the answer into the transcript. */
  const runCoach = useCallback(async (facts: CoachFacts, event: 'turn' | 'question', q?: string) => {
    abortRef.current?.abort()
    const ctrl = new AbortController()
    abortRef.current = ctrl
    const gen = genRef.current
    setCoachBusy(true)
    setLines((l) => [...l, { who: 'coach', text: '' }])
    const setLast = (text: string) =>
      setLines((l) => (gen === genRef.current ? [...l.slice(0, -1), { who: 'coach', text }] : l))
    let final = ''
    try {
      if (!user) throw new ApiError('guest', 401)
      final = await streamCoach(
        {
          fen: gameRef.current.fen(), event, persona: prefs.persona, guidance: prefs.guidance, provider,
          history: gameRef.current.history(), question: q, facts
        },
        setLast,
        ctrl.signal
      )
      if (!final) throw new ApiError('empty', 502)
    } catch (err) {
      if ((err as Error).name === 'AbortError') return
      final = fallbackCoach(facts, prefs.guidance, q)
      setLast(final)
    } finally {
      if (gen === genRef.current) setCoachBusy(false)
    }
    if (gen === genRef.current) speak(final)
  }, [user, prefs.persona, prefs.guidance, provider, speak])

  const recordGame = useCallback(async (resigned: boolean, label: string) => {
    if (!user || mode === 'pass') return label
    try {
      const res = await api<{ ratingBefore: number; ratingAfter: number; rated: boolean; user: User }>('/games', {
        body: { pgn: gameRef.current.pgn(), mode, difficulty, resigned }
      })
      setUser(res.user)
      if (res.rated) {
        const d = res.ratingAfter - res.ratingBefore
        return `${label} Rating ${res.ratingBefore} → ${res.ratingAfter} (${d > 0 ? '+' : ''}${d}).`
      }
      return `${label} (Coach games are unrated.)`
    } catch (err) {
      return `${label} Couldn\u2019t save this game: ${err instanceof ApiError ? err.message : 'unknown error'}`
    }
  }, [user, mode, difficulty, setUser])

  const finishIfOver = useCallback(async (): Promise<boolean> => {
    const g = gameRef.current
    if (!g.isGameOver()) return false
    setIsOver(true)
    const label = g.isCheckmate()
      ? g.turn() === 'b' ? 'Checkmate — you win.' : 'Checkmate — Black wins.'
      : g.isStalemate() ? 'Draw by stalemate.'
      : g.isThreefoldRepetition() ? 'Draw by repetition.' : 'Draw.'
    setBanner(await recordGame(false, label))
    if (coachOn) setLines((l) => [...l, { who: 'coach', text: g.isCheckmate() && g.turn() === 'b' ? 'Beautifully done — you earned that one. Want a rematch?' : 'Good fight. Every game teaches something — start another and let\u2019s work on it.' }])
    return true
  }, [recordGame, coachOn])

  /** Engine analysis (fixed medium strength, so coaching is consistent regardless of opponent level). */
  const analyse = (fen: string) => requestBotMove(fen, 'medium', { timeMs: 350, randomness: 0 })

  const startTurnAnalysis = useCallback(async (opening: boolean) => {
    const gen = genRef.current
    const a = await analyse(gameRef.current.fen())
    if (gen !== genRef.current || !a) return
    turnRef.current = { bestSan: a.san, score: a.score }
    if (opening) {
      const facts: CoachFacts = {
        studentLastMove: null, verdict: null, pawnsLost: null, betterMove: null, opponentReply: null,
        recommendedNow: a.san, evalPawns: a.score / 100, phase: 'opening'
      }
      factsRef.current = facts
      void runCoach(facts, 'turn')
    }
  }, [runCoach])

  async function handleMove(from: Square, to: Square, promotion?: string) {
    if (isOver || thinking) return
    const g = gameRef.current
    const before = turnRef.current
    const move = g.move({ from, to, promotion })
    if (!move) return
    setLastMove({ from, to })
    rerender()
    if (await finishIfOver()) return
    if (mode === 'pass') return

    const gen = genRef.current
    setThinking(true)
    try {
      const afterFen = g.fen()
      // The opponent's reply and (in coach mode) a consistent evaluation of the student's move run in parallel.
      const [reply, afterEval] = await Promise.all([
        requestBotMove(afterFen, difficulty),
        coachOn ? analyse(afterFen) : Promise.resolve(null)
      ])
      if (gen !== genRef.current) return
      if (reply) {
        g.move({ from: reply.from, to: reply.to, promotion: reply.promotion })
        setLastMove({ from: reply.from, to: reply.to })
        rerender()
      }
      setThinking(false)
      if (await finishIfOver()) return

      if (coachOn) {
        const verdict = before && afterEval ? judge(move.san, before.bestSan, before.score, afterEval.score) : null
        const now = await analyse(g.fen())
        if (gen !== genRef.current || !now) return
        turnRef.current = { bestSan: now.san, score: now.score }
        const facts: CoachFacts = {
          studentLastMove: move.san,
          verdict: verdict?.verdict ?? null,
          pawnsLost: verdict ? verdict.lossCp / 100 : null,
          betterMove: before?.bestSan ?? null,
          opponentReply: reply?.san ?? null,
          recommendedNow: now.san,
          evalPawns: now.score / 100,
          phase: gamePhase(g.fen(), g.history().length)
        }
        factsRef.current = facts
        void runCoach(facts, 'turn')
      }
    } finally {
      if (gen === genRef.current) setThinking(false)
    }
  }

  function newGame(next: Mode = mode) {
    genRef.current += 1
    abortRef.current?.abort()
    window.speechSynthesis?.cancel()
    gameRef.current.reset()
    turnRef.current = null
    factsRef.current = null
    setMode(next)
    setLastMove(null)
    setIsOver(false)
    setThinking(false)
    setCoachBusy(false)
    setBanner(null)
    setLines([])
    rerender()
    if (next === 'coach') {
      // Analysis for move one, then the coach greets the student.
      setTimeout(() => void startTurnAnalysis(true), 0)
    }
  }

  async function resign() {
    if (isOver) return
    setIsOver(true)
    setBanner(await recordGame(true, 'You resigned.'))
  }

  function ask(e: React.FormEvent) {
    e.preventDefault()
    const q = question.trim()
    if (!q || coachBusy) return
    setLines((l) => [...l, { who: 'you', text: q }])
    setQuestion('')
    const facts = factsRef.current ?? {
      studentLastMove: null, verdict: null, pawnsLost: null, betterMove: null, opponentReply: null,
      recommendedNow: turnRef.current?.bestSan ?? null, evalPawns: null, phase: gamePhase(gameRef.current.fen(), gameRef.current.history().length)
    }
    void runCoach(facts, 'question', q)
  }

  // Start the first coach game automatically.
  const started = useRef(false)
  useEffect(() => {
    if (!started.current) {
      started.current = true
      newGame('coach')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const modeBtn = (m: Mode, label: string) => (
    <button
      key={m}
      onClick={() => newGame(m)}
      className={`flex-1 rounded px-3 py-1.5 text-sm transition-colors ${mode === m ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-ink'}`}
    >
      {label}
    </button>
  )

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-8 px-6 py-10 lg:flex-row lg:items-start">
      <div className="flex flex-col items-center gap-4">
        <ChessBoard game={game} onMove={handleMove} disabled={isOver || thinking} lastMove={lastMove} />
        <p className="h-5 text-sm text-muted">{thinking ? 'Black is thinking…' : ''}</p>
        {banner && <div role="status" className="w-full max-w-[480px] rounded-md border border-border bg-surface px-4 py-3 text-sm">{banner}</div>}
      </div>

      <aside className="flex w-full flex-1 flex-col gap-6 lg:max-w-sm">
        <div className="flex gap-1 rounded-md border border-border p-1">
          {modeBtn('coach', 'Play with coach')}
          {modeBtn('engine', 'Rated')}
          {modeBtn('pass', 'Pass & play')}
        </div>

        {mode !== 'pass' && (
          <div className="flex items-center gap-3 text-sm">
            <span className="text-muted">Opponent</span>
            {(Object.keys(BOT_DIFFICULTY_CONFIG) as BotDifficulty[]).map((k) => (
              <label key={k} className="flex items-center gap-1.5">
                <input type="radio" name="difficulty" checked={difficulty === k} onChange={() => setDifficulty(k)} className="accent-[rgb(var(--color-accent))]" />
                {BOT_DIFFICULTY_CONFIG[k].label}
              </label>
            ))}
          </div>
        )}

        {coachOn ? (
          <section aria-label="Coach" className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <select value={prefs.persona} onChange={(e) => setPrefs({ ...prefs, persona: e.target.value as Persona })} className="rounded-md border border-border bg-surface px-2 py-1.5">
                {(Object.keys(PERSONAS) as Persona[]).map((p) => <option key={p} value={p}>{PERSONAS[p].name}</option>)}
              </select>
              <select value={prefs.guidance} onChange={(e) => setPrefs({ ...prefs, guidance: e.target.value as Guidance })} className="rounded-md border border-border bg-surface px-2 py-1.5">
                <option value="move">Tell me the move</option>
                <option value="ideas">Ideas only</option>
              </select>
              {providers.length > 1 && (
                <select value={provider} onChange={(e) => setProvider(e.target.value as 'gemini' | 'groq')} className="rounded-md border border-border bg-surface px-2 py-1.5">
                  {providers.map((p) => <option key={p} value={p}>{p === 'gemini' ? 'Gemini' : 'Groq'}</option>)}
                </select>
              )}
              <label className="flex items-center gap-1.5 text-muted">
                <input type="checkbox" checked={prefs.speak} onChange={(e) => { if (!e.target.checked) window.speechSynthesis?.cancel(); setPrefs({ ...prefs, speak: e.target.checked }) }} className="accent-[rgb(var(--color-accent))]" />
                Read aloud
              </label>
            </div>

            {!user && (
              <p className="rounded-md border border-border bg-surface px-3 py-2 text-xs text-muted">
                You’re using the built-in coach. <Link to="/login" className="text-ink underline">Sign in</Link> for the AI coach and to save your games.
              </p>
            )}

            <div className="max-h-72 min-h-40 space-y-3 overflow-y-auto rounded-md border border-border bg-surface p-4 text-sm" aria-live="polite">
              {lines.length === 0 && <p className="text-muted">Your coach will speak up once the game begins.</p>}
              {lines.map((l, i) => (
                <p key={i} className={l.who === 'you' ? 'text-right text-muted' : 'leading-relaxed'}>
                  {l.who === 'coach' && <span className="mr-1.5 font-display text-accent">{PERSONAS[prefs.persona].name.split(' ')[1]}</span>}
                  {l.text || <span className="text-muted">…</span>}
                </p>
              ))}
              <div ref={transcriptEnd} />
            </div>

            <form onSubmit={ask} className="flex gap-2">
              <input value={question} onChange={(e) => setQuestion(e.target.value)} maxLength={500} placeholder="Ask the coach anything…" className={textInputClass} />
              <Button type="submit" disabled={coachBusy || !question.trim()}>Ask</Button>
            </form>
          </section>
        ) : (
          <p className="text-sm text-muted">
            {mode === 'engine' ? 'No hints in rated games — your rating changes with the result.' : 'Two players, one board.'}
          </p>
        )}

        <div className="flex items-center justify-between">
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => newGame()}>New game</Button>
            {!isOver && mode !== 'pass' && <button onClick={resign} className="px-2 text-sm text-muted hover:text-bad transition-colors">Resign</button>}
          </div>
          <p className="text-xs text-muted">{game.history().length} moves</p>
        </div>

        <ol className="max-h-40 space-y-1 overflow-y-auto text-sm">
          {chunkPairs(game.history()).map(([w, b], i) => (
            <li key={i} className="flex gap-2 text-muted">
              <span className="w-6 text-right">{i + 1}.</span>
              <span className="w-16 text-ink">{w}</span>
              <span className="text-ink">{b ?? ''}</span>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  )
}

function chunkPairs(moves: string[]): [string, string | undefined][] {
  const pairs: [string, string | undefined][] = []
  for (let i = 0; i < moves.length; i += 2) pairs.push([moves[i], moves[i + 1]])
  return pairs
}
