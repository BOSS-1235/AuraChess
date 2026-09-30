import cookieParser from 'cookie-parser'
import express from 'express'
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { config } from './config'
import './db'
import { emailConfigured } from './mailer'
import { availableProviders } from './aiProviders'
import { aiRouter } from './routes/ai'
import { authRouter } from './routes/auth'
import { gamesRouter } from './routes/games'
import { webauthnRouter } from './routes/webauthn'
import { loadUser } from './session'

const app = express()
app.disable('x-powered-by')
if (config.isProd) app.set('trust proxy', 1) // behind Render/Railway/Fly/etc. so rate limits see the real IP

app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin')
  next()
})
app.use(express.json({ limit: '100kb' }))
app.use(cookieParser())

// CSRF defence for cookie auth: state-changing API calls must come from an allowed origin.
app.use('/api', (req, res, next) => {
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const origin = req.get('origin')
    if (origin && !config.allowedOrigins.includes(origin)) return void res.status(403).json({ error: 'Origin not allowed.' })
  }
  next()
})
app.use('/api', loadUser)

app.get('/api/health', (_req, res) => res.json({ ok: true, email: emailConfigured, ai: availableProviders() }))
app.use('/api/auth', authRouter)
app.use('/api/webauthn', webauthnRouter)
app.use('/api/ai', aiRouter)
app.use('/api', gamesRouter)
app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }))

// In production the same server also serves the built website, so cookies stay same-origin.
const dist = resolve('dist')
if (existsSync(dist)) {
  app.use(express.static(dist, { maxAge: '1h', index: false }))
  // SPA fallback: any non-API GET (e.g. a deep link to /play or /dashboard on a fresh
  // load) serves the app shell; React Router takes it from there.
  app.get(/^\/(?!api).*/, (_req, res) => res.sendFile(resolve(dist, 'index.html')))
}

app.listen(config.port, () => {
  console.log(`AuraChess server on http://localhost:${config.port}`)
  console.log(`  email: ${emailConfigured ? 'SMTP configured' : 'DEV mode (codes print here in the console)'}`)
  console.log(`  ai:    ${availableProviders().join(', ') || 'none configured (coach uses built-in fallback)'}`)
})
