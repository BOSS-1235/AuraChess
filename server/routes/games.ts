import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { Chess } from 'chess.js'
import { z } from 'zod'
import { db, type UserRow } from '../db'
import { requireAuth, publicUser } from '../session'
import { calculateNewRating } from '../../src/lib/elo'

export const gamesRouter = Router()

const OPPONENT_RATING: Record<string, number> = { easy: 800, medium: 1200, hard: 1600 }

const submitLimiter = rateLimit({
  windowMs: 60 * 60_000,
  limit: 40,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => `u${req.user!.id}`
})

gamesRouter.post('/games', requireAuth, submitLimiter, (req, res) => {
  const parsed = z
    .object({
      pgn: z.string().min(1).max(20_000),
      mode: z.enum(['engine', 'coach']),
      difficulty: z.enum(['easy', 'medium', 'hard']),
      resigned: z.boolean().optional()
    })
    .safeParse(req.body)
  if (!parsed.success) return void res.status(400).json({ error: 'Invalid game data.' })
  const { pgn, mode, difficulty, resigned } = parsed.data

  // Replay the moves on the server: illegal move lists are rejected, and the result is
  // derived from the board itself rather than trusted from the browser.
  const chess = new Chess()
  try {
    chess.loadPgn(pgn)
  } catch {
    return void res.status(400).json({ error: 'That game contains an illegal move.' })
  }

  let score: 0 | 0.5 | 1
  let result: string
  if (resigned && !chess.isGameOver()) {
    score = 0
    result = 'resigned'
  } else if (chess.isCheckmate()) {
    score = chess.turn() === 'w' ? 0 : 1 // the side to move is the one mated; the student plays White
    result = score === 1 ? 'win' : 'loss'
  } else if (chess.isDraw()) {
    score = 0.5
    result = 'draw'
  } else {
    return void res.status(400).json({ error: 'That game isn\u2019t finished.' })
  }

  const user = req.user as UserRow
  const rated = mode === 'engine'
  let ratingAfter = user.rating
  if (rated) ratingAfter = calculateNewRating(user.rating, OPPONENT_RATING[difficulty], score).newRating

  db.prepare(
    `UPDATE users SET rating = ?, games_played = games_played + 1,
       wins = wins + ?, losses = losses + ?, draws = draws + ? WHERE id = ?`
  ).run(ratingAfter, score === 1 ? 1 : 0, score === 0 ? 1 : 0, score === 0.5 ? 1 : 0, user.id)
  db.prepare(
    `INSERT INTO games (user_id, pgn, mode, difficulty, result, rated, rating_before, rating_after, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(user.id, pgn, mode, difficulty, result, rated ? 1 : 0, rated ? user.rating : null, rated ? ratingAfter : null, Date.now())

  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id) as UserRow
  res.json({ result, rated, ratingBefore: user.rating, ratingAfter, user: publicUser(fresh) })
})

gamesRouter.get('/games', requireAuth, (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, mode, difficulty, result, rated, rating_before AS ratingBefore, rating_after AS ratingAfter, created_at AS createdAt
       FROM games WHERE user_id = ? ORDER BY created_at DESC LIMIT 20`
    )
    .all(req.user!.id)
  res.json({ games: rows })
})

gamesRouter.get('/leaderboard', (_req, res) => {
  const rows = db
    .prepare(
      `SELECT username, rating, games_played AS gamesPlayed, wins, losses, draws
       FROM users WHERE games_played > 0 ORDER BY rating DESC, wins DESC LIMIT 50`
    )
    .all()
  res.json({ players: rows })
})
