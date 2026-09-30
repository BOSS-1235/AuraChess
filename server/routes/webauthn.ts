import { Router } from 'express'
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON
} from '@simplewebauthn/server'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { config } from '../config'
import { db, type UserRow } from '../db'
import { createSession, publicUser, requireAuth } from '../session'

/**
 * Real, server-verified WebAuthn (Face ID / Touch ID / Windows Hello / Android biometrics).
 * The private key never leaves the device; the server stores only the public key and
 * checks a fresh signature over a one-time challenge on every sign-in.
 */
export const webauthnRouter = Router()

function originInfo(req: import('express').Request) {
  const origin = req.get('origin') ?? ''
  if (!config.allowedOrigins.includes(origin)) return null
  return { origin, rpID: new URL(origin).hostname }
}

function saveChallenge(challenge: string, userId: number | null): string {
  const id = randomBytes(16).toString('base64url')
  db.prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').run(Date.now())
  db.prepare('INSERT INTO webauthn_challenges (id, challenge, user_id, expires_at) VALUES (?, ?, ?, ?)').run(
    id,
    challenge,
    userId,
    Date.now() + 5 * 60_000
  )
  return id
}

function takeChallenge(id: string): { challenge: string; user_id: number | null } | null {
  const row = db.prepare('SELECT * FROM webauthn_challenges WHERE id = ? AND expires_at > ?').get(id, Date.now()) as
    | { challenge: string; user_id: number | null }
    | undefined
  db.prepare('DELETE FROM webauthn_challenges WHERE id = ?').run(id) // single use
  return row ?? null
}

webauthnRouter.get('/status', requireAuth, (req, res) => {
  const count = db.prepare('SELECT COUNT(*) AS n FROM webauthn_credentials WHERE user_id = ?').get(req.user!.id) as { n: number }
  res.json({ registered: count.n > 0, count: count.n })
})

webauthnRouter.delete('/credentials', requireAuth, (req, res) => {
  db.prepare('DELETE FROM webauthn_credentials WHERE user_id = ?').run(req.user!.id)
  res.json({ ok: true })
})

webauthnRouter.post('/register/options', requireAuth, async (req, res) => {
  const info = originInfo(req)
  if (!info) return void res.status(400).json({ error: 'This origin is not allowed for biometric sign-in.' })
  const user = req.user!
  const existing = db.prepare('SELECT id, transports FROM webauthn_credentials WHERE user_id = ?').all(user.id) as {
    id: string
    transports: string | null
  }[]

  const options = await generateRegistrationOptions({
    rpName: 'AuraChess',
    rpID: info.rpID,
    userName: user.email,
    userDisplayName: user.username,
    userID: new TextEncoder().encode(String(user.id)),
    attestationType: 'none',
    excludeCredentials: existing.map((c) => ({
      id: c.id,
      transports: c.transports ? JSON.parse(c.transports) : undefined
    })),
    authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred', authenticatorAttachment: 'platform' }
  })
  res.json({ options, challengeId: saveChallenge(options.challenge, user.id) })
})

webauthnRouter.post('/register/verify', requireAuth, async (req, res) => {
  const info = originInfo(req)
  if (!info) return void res.status(400).json({ error: 'This origin is not allowed for biometric sign-in.' })
  const parsed = z.object({ challengeId: z.string(), response: z.any() }).safeParse(req.body)
  if (!parsed.success) return void res.status(400).json({ error: 'Invalid request.' })

  const stored = takeChallenge(parsed.data.challengeId)
  if (!stored || stored.user_id !== req.user!.id) return void res.status(400).json({ error: 'That request expired. Try again.' })

  try {
    const result = await verifyRegistrationResponse({
      response: parsed.data.response as RegistrationResponseJSON,
      expectedChallenge: stored.challenge,
      expectedOrigin: info.origin,
      expectedRPID: info.rpID
    })
    if (!result.verified) return void res.status(400).json({ error: 'Biometric setup could not be verified.' })
    const { credential } = result.registrationInfo
    db.prepare(
      `INSERT INTO webauthn_credentials (id, user_id, public_key, counter, transports, created_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(
      credential.id,
      req.user!.id,
      Buffer.from(credential.publicKey),
      credential.counter,
      credential.transports ? JSON.stringify(credential.transports) : null,
      Date.now()
    )
    res.json({ ok: true })
  } catch (err) {
    console.error('webauthn register verify failed:', err)
    res.status(400).json({ error: 'Biometric setup could not be verified.' })
  }
})

// Discoverable-credential sign-in: no email needed, the device offers the right account.
webauthnRouter.post('/login/options', async (req, res) => {
  const info = originInfo(req)
  if (!info) return void res.status(400).json({ error: 'This origin is not allowed for biometric sign-in.' })
  const options = await generateAuthenticationOptions({ rpID: info.rpID, userVerification: 'preferred' })
  res.json({ options, challengeId: saveChallenge(options.challenge, null) })
})

webauthnRouter.post('/login/verify', async (req, res) => {
  const info = originInfo(req)
  if (!info) return void res.status(400).json({ error: 'This origin is not allowed for biometric sign-in.' })
  const parsed = z.object({ challengeId: z.string(), response: z.any(), remember: z.boolean().optional() }).safeParse(req.body)
  if (!parsed.success) return void res.status(400).json({ error: 'Invalid request.' })

  const stored = takeChallenge(parsed.data.challengeId)
  if (!stored) return void res.status(400).json({ error: 'That request expired. Try again.' })

  const response = parsed.data.response as AuthenticationResponseJSON
  const cred = db.prepare('SELECT * FROM webauthn_credentials WHERE id = ?').get(response.id) as
    | { id: string; user_id: number; public_key: Buffer; counter: number; transports: string | null }
    | undefined
  if (!cred) return void res.status(401).json({ error: 'This device isn\u2019t registered. Sign in with your password first.' })

  try {
    const result = await verifyAuthenticationResponse({
      response,
      expectedChallenge: stored.challenge,
      expectedOrigin: info.origin,
      expectedRPID: info.rpID,
      credential: {
        id: cred.id,
        publicKey: new Uint8Array(cred.public_key),
        counter: cred.counter,
        transports: cred.transports ? JSON.parse(cred.transports) : undefined
      }
    })
    if (!result.verified) return void res.status(401).json({ error: 'Biometric check failed.' })
    db.prepare('UPDATE webauthn_credentials SET counter = ? WHERE id = ?').run(result.authenticationInfo.newCounter, cred.id)
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(cred.user_id) as UserRow
    createSession(res, user.id, parsed.data.remember ?? true)
    res.json({ user: publicUser(user) })
  } catch (err) {
    console.error('webauthn login verify failed:', err)
    res.status(401).json({ error: 'Biometric check failed.' })
  }
})
