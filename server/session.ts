import type { NextFunction, Request, Response } from 'express'
import { config } from './config'
import { db, type UserRow } from './db'
import { newToken, sha256 } from './security'

export const COOKIE_NAME = 'aura_session'

declare module 'express-serve-static-core' {
  interface Request {
    user?: UserRow
  }
}

export function createSession(res: Response, userId: number, remember: boolean) {
  const token = newToken()
  const ttlMs = remember ? config.sessionDaysRemember * 86_400_000 : config.sessionHoursDefault * 3_600_000
  db.prepare('INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)').run(
    sha256(token),
    userId,
    Date.now() + ttlMs
  )
  res.cookie(COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.isProd,
    path: '/',
    // "Remember me" = persistent cookie; otherwise a browser-session cookie.
    ...(remember ? { maxAge: ttlMs } : {})
  })
}

export function destroySession(req: Request, res: Response) {
  const token = req.cookies?.[COOKIE_NAME]
  if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token))
  res.clearCookie(COOKIE_NAME, { path: '/' })
}

export function destroyAllSessions(userId: number) {
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(userId)
}

export function loadUser(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[COOKIE_NAME]
  if (token) {
    const row = db
      .prepare(
        `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > ?`
      )
      .get(sha256(token), Date.now()) as UserRow | undefined
    if (row) req.user = row
  }
  next()
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) return void res.status(401).json({ error: 'Please sign in first.' })
  next()
}

export function publicUser(u: UserRow) {
  return {
    id: u.id,
    username: u.username,
    email: u.email,
    rating: u.rating,
    gamesPlayed: u.games_played,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws
  }
}
