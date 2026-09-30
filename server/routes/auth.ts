import { Router } from 'express'
import rateLimit from 'express-rate-limit'
import { z } from 'zod'
import { db, type UserRow } from '../db'
import { sendOtpEmail } from '../mailer'
import { hashOtp, hashPassword, newOtp, newSalt, safeEqualHex, verifyPassword } from '../security'
import { createSession, destroyAllSessions, destroySession, publicUser } from '../session'

export const authRouter = Router()

const limiter = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false })
const forgotLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 8, standardHeaders: true, legacyHeaders: false })
authRouter.use(limiter)

const emailSchema = z.string().trim().toLowerCase().email('Enter a valid email address.').max(254)
const passwordSchema = z.string().min(8, 'Password must be at least 8 characters.').max(128)
const usernameSchema = z
  .string()
  .trim()
  .min(3, 'Username must be at least 3 characters.')
  .max(20, 'Username can be at most 20 characters.')
  .regex(/^[A-Za-z0-9_.-]+$/, 'Username can only use letters, numbers, dot, dash and underscore.')

function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? 'Invalid input.'
}

// A pre-computed dummy hash so unknown-email logins take as long as real ones.
const DUMMY_SALT = newSalt()
const dummyHashPromise = hashPassword('dummy-password', DUMMY_SALT)

const LOCK_AFTER = 5
const LOCK_MS = 15 * 60_000

authRouter.post('/register', async (req, res) => {
  const parsed = z
    .object({ username: usernameSchema, email: emailSchema, password: passwordSchema })
    .safeParse(req.body)
  if (!parsed.success) return void res.status(400).json({ error: firstError(parsed.error) })
  const { username, email, password } = parsed.data

  if (db.prepare('SELECT 1 FROM users WHERE email = ?').get(email))
    return void res.status(409).json({ error: 'An account with this email already exists.' })
  if (db.prepare('SELECT 1 FROM users WHERE username_lower = ?').get(username.toLowerCase()))
    return void res.status(409).json({ error: 'That username is taken.' })

  const salt = newSalt()
  const hash = await hashPassword(password, salt)
  const info = db
    .prepare(
      `INSERT INTO users (username, username_lower, email, password_salt, password_hash, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(username, username.toLowerCase(), email, salt, hash, Date.now())

  createSession(res, Number(info.lastInsertRowid), true)
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid) as UserRow
  res.status(201).json({ user: publicUser(user) })
})

authRouter.post('/login', async (req, res) => {
  const parsed = z
    .object({ email: emailSchema, password: z.string().min(1).max(128), remember: z.boolean().optional() })
    .safeParse(req.body)
  if (!parsed.success) return void res.status(400).json({ error: firstError(parsed.error) })
  const { email, password, remember } = parsed.data

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined
  const GENERIC = 'Incorrect email or password.'

  if (!user) {
    await verifyPassword(password, DUMMY_SALT, await dummyHashPromise)
    return void res.status(401).json({ error: GENERIC })
  }
  if (user.locked_until > Date.now()) {
    const mins = Math.ceil((user.locked_until - Date.now()) / 60_000)
    return void res.status(429).json({ error: `Too many failed attempts. Try again in ${mins} min, or reset your password.` })
  }

  const ok = await verifyPassword(password, user.password_salt, user.password_hash)
  if (!ok) {
    const failed = user.failed_logins + 1
    if (failed >= LOCK_AFTER) {
      db.prepare('UPDATE users SET failed_logins = 0, locked_until = ? WHERE id = ?').run(Date.now() + LOCK_MS, user.id)
    } else {
      db.prepare('UPDATE users SET failed_logins = ? WHERE id = ?').run(failed, user.id)
    }
    return void res.status(401).json({ error: GENERIC })
  }

  db.prepare('UPDATE users SET failed_logins = 0, locked_until = 0 WHERE id = ?').run(user.id)
  createSession(res, user.id, remember ?? false)
  res.json({ user: publicUser(user) })
})

authRouter.post('/logout', (req, res) => {
  destroySession(req, res)
  res.json({ ok: true })
})

authRouter.get('/me', (req, res) => {
  res.json({ user: req.user ? publicUser(req.user) : null })
})

// ---- Password reset via emailed one-time code --------------------------------

const OTP_TTL_MS = 10 * 60_000
const OTP_COOLDOWN_MS = 60_000
const OTP_MAX_ATTEMPTS = 5

authRouter.post('/forgot', forgotLimiter, async (req, res) => {
  const parsed = z.object({ email: emailSchema }).safeParse(req.body)
  if (!parsed.success) return void res.status(400).json({ error: firstError(parsed.error) })
  const { email } = parsed.data

  // Same response whether or not the email exists, so this can't be used to find accounts.
  const generic = { ok: true, message: 'If that email has an account, we\u2019ve sent a 6-digit code. It expires in 10 minutes.' }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined
  if (!user) return void res.json(generic)

  const existing = db.prepare('SELECT created_at FROM password_resets WHERE user_id = ?').get(user.id) as
    | { created_at: number }
    | undefined
  if (existing && Date.now() - existing.created_at < OTP_COOLDOWN_MS) return void res.json(generic)

  const otp = newOtp()
  db.prepare(
    `INSERT INTO password_resets (user_id, otp_hash, expires_at, attempts, created_at) VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(user_id) DO UPDATE SET otp_hash = excluded.otp_hash, expires_at = excluded.expires_at,
       attempts = 0, created_at = excluded.created_at`
  ).run(user.id, hashOtp(email, otp), Date.now() + OTP_TTL_MS, Date.now())

  try {
    await sendOtpEmail(email, user.username, otp)
  } catch (err) {
    console.error('Failed to send reset email:', err)
  }
  res.json(generic)
})

authRouter.post('/reset', forgotLimiter, async (req, res) => {
  const parsed = z
    .object({ email: emailSchema, otp: z.string().regex(/^\d{6}$/, 'Enter the 6-digit code.'), newPassword: passwordSchema })
    .safeParse(req.body)
  if (!parsed.success) return void res.status(400).json({ error: firstError(parsed.error) })
  const { email, otp, newPassword } = parsed.data

  const BAD = 'That code is invalid or has expired. Request a new one.'
  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined
  if (!user) return void res.status(400).json({ error: BAD })

  const row = db.prepare('SELECT * FROM password_resets WHERE user_id = ?').get(user.id) as
    | { otp_hash: string; expires_at: number; attempts: number }
    | undefined
  if (!row || row.expires_at < Date.now() || row.attempts >= OTP_MAX_ATTEMPTS) {
    db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id)
    return void res.status(400).json({ error: BAD })
  }
  if (!safeEqualHex(row.otp_hash, hashOtp(email, otp))) {
    db.prepare('UPDATE password_resets SET attempts = attempts + 1 WHERE user_id = ?').run(user.id)
    return void res.status(400).json({ error: BAD })
  }

  const salt = newSalt()
  const hash = await hashPassword(newPassword, salt)
  db.prepare('UPDATE users SET password_salt = ?, password_hash = ?, failed_logins = 0, locked_until = 0 WHERE id = ?').run(
    salt,
    hash,
    user.id
  )
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id)
  destroyAllSessions(user.id) // a reset signs out every device
  res.json({ ok: true })
})
