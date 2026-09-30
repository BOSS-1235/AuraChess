import { Router, type Response } from 'express'
import rateLimit from 'express-rate-limit'
import { Chess } from 'chess.js'
import { z } from 'zod'
import { availableProviders, streamText, type Provider, type Turn } from '../aiProviders'
import { requireAuth } from '../session'

export const aiRouter = Router()

const limiter = rateLimit({
  windowMs: 60_000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `u${req.user!.id}`
})

aiRouter.get('/providers', (_req, res) => {
  res.json({ providers: availableProviders() })
})

const PERSONAS = {
  elena: { name: 'Coach Elena', style: 'patient and encouraging; you teach sound fundamentals and long-term plans' },
  marcus: { name: 'Coach Marcus', style: 'energetic and direct; you love tactics and initiative' },
  ada: { name: 'Coach Ada', style: 'calm and precise; you explain the logic of a position step by step' }
} as const

const verdictSchema = z.enum(['best', 'good', 'inaccuracy', 'mistake', 'blunder'])

const coachSchema = z.object({
  fen: z.string().max(100),
  event: z.enum(['turn', 'question']),
  persona: z.enum(['elena', 'marcus', 'ada']).default('elena'),
  guidance: z.enum(['move', 'ideas']).default('move'),
  provider: z.enum(['gemini', 'groq']).optional(),
  history: z.array(z.string().max(12)).max(400).default([]),
  question: z.string().trim().max(500).optional(),
  facts: z
    .object({
      studentLastMove: z.string().max(12).nullable().optional(),
      verdict: verdictSchema.nullable().optional(),
      pawnsLost: z.number().min(-50).max(50).nullable().optional(),
      betterMove: z.string().max(12).nullable().optional(),
      opponentReply: z.string().max(12).nullable().optional(),
      recommendedNow: z.string().max(12).nullable().optional(),
      evalPawns: z.number().min(-99).max(99).nullable().optional(),
      phase: z.enum(['opening', 'middlegame', 'endgame']).optional()
    })
    .default({})
})

function pickProvider(requested: Provider | undefined): Provider | null {
  const avail = availableProviders()
  if (requested && avail.includes(requested)) return requested
  return avail[0] ?? null
}

async function pipeStream(res: Response, gen: AsyncGenerator<string>, abort: AbortController) {
  res.on('close', () => abort.abort())
  res.setHeader('content-type', 'text/plain; charset=utf-8')
  res.setHeader('cache-control', 'no-store')
  res.setHeader('x-accel-buffering', 'no')
  let started = false
  try {
    for await (const chunk of gen) {
      started = true
      res.write(chunk)
    }
    if (!started) throw new Error('empty response')
    res.end()
  } catch (err) {
    if (abort.signal.aborted) return
    console.error('AI stream error:', (err as Error).message)
    if (!started) {
      res.removeHeader('content-type')
      res.status(502).json({ error: 'The AI coach is unavailable right now.', fallback: true })
    } else {
      res.end()
    }
  }
}

aiRouter.post('/coach', requireAuth, limiter, async (req, res) => {
  const parsed = coachSchema.safeParse(req.body)
  if (!parsed.success) return void res.status(400).json({ error: 'Invalid request.' })
  const d = parsed.data

  let fenOk = true
  try {
    new Chess(d.fen)
  } catch {
    fenOk = false
  }
  if (!fenOk) return void res.status(400).json({ error: 'Invalid position.' })

  const provider = pickProvider(d.provider)
  if (!provider) return void res.status(503).json({ error: 'No AI provider is configured on the server.', fallback: true })

  const persona = PERSONAS[d.persona]
  const f = d.facts
  const system = [
    `You are ${persona.name}, a chess coach who is playing a live game against your student. The student has White; you (the engine) have Black.`,
    `Your style: ${persona.style}.`,
    'Rules you must follow:',
    '- Use ONLY the facts provided. Never invent moves, evaluations or tactics that are not in the facts.',
    '- Reply in plain text, no markdown, no emojis, no lists.',
    d.event === 'turn'
      ? '- Write at most 3 short sentences (under 70 words): first react to the student\u2019s last move using the verdict, then tell them what to do now.'
      : '- Answer the student\u2019s question in at most 4 short sentences (under 90 words), grounded in the facts.',
    d.guidance === 'move'
      ? '- When telling them what to do now, name the recommended move exactly as written and explain the idea behind it in one sentence.'
      : '- Do NOT name a specific move. Describe the plan or idea to look for instead.',
    '- If the phase is opening, mention one relevant principle (develop pieces, control the center, castle). If endgame, mention king activity or passed pawns.',
    '- If the verdict is mistake or blunder, be kind: say what went wrong briefly and how to avoid it.'
  ].join('\n')

  const lines = [
    `Position (FEN): ${d.fen}`,
    `Game so far: ${d.history.slice(-30).join(' ') || '(no moves yet)'}`,
    f.phase ? `Phase: ${f.phase}` : '',
    f.studentLastMove ? `Student's last move: ${f.studentLastMove}${f.verdict ? ` (verdict: ${f.verdict}${f.pawnsLost != null ? `, lost about ${f.pawnsLost.toFixed(1)} pawns of value` : ''})` : ''}` : 'Student has not moved yet.',
    f.betterMove && f.verdict && f.verdict !== 'best' && f.verdict !== 'good' ? `A better move was: ${f.betterMove}` : '',
    f.opponentReply ? `Your (engine) reply: ${f.opponentReply}` : '',
    f.recommendedNow ? `Recommended move for the student now: ${f.recommendedNow}` : '',
    f.evalPawns != null ? `Engine evaluation from the student's side: ${f.evalPawns >= 0 ? '+' : ''}${f.evalPawns.toFixed(1)} pawns` : '',
    d.event === 'question' && d.question ? `Student's question: ${d.question}` : "Give your coaching for this turn."
  ].filter(Boolean)

  const abort = new AbortController()
  await pipeStream(res, streamText(provider, system, [{ role: 'user', content: lines.join('\n') }], 220, abort.signal), abort)
})

const chatSchema = z.object({
  provider: z.enum(['gemini', 'groq']).optional(),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) }))
    .min(1)
    .max(30)
})

aiRouter.post('/chat', requireAuth, limiter, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body)
  if (!parsed.success) return void res.status(400).json({ error: 'Invalid request.' })
  const provider = pickProvider(parsed.data.provider)
  if (!provider) return void res.status(503).json({ error: 'No AI provider is configured on the server.', fallback: true })

  const system =
    'You are a warm, encouraging chess tutor. Explain ideas clearly and briefly in plain language, ' +
    'write chess moves in standard algebraic notation, and if you are not sure about a specific line, say so instead of guessing. ' +
    'Keep answers under 200 words. Plain text only.'
  const turns: Turn[] = parsed.data.messages
  const abort = new AbortController()
  await pipeStream(res, streamText(provider, system, turns, 500, abort.signal), abort)
})
