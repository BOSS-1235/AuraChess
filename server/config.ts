import 'node:process'

/** All configuration comes from environment variables — no secrets in code. */
const isProd = process.env.NODE_ENV === 'production'

export const config = {
  isProd,
  port: Number(process.env.PORT ?? 8787),
  dbPath: process.env.DB_PATH ?? 'data/aurachess.db',
  // Origins the browser app is served from. Used for WebAuthn and CORS-free same-origin checks.
  allowedOrigins: (process.env.APP_ORIGINS ?? 'http://localhost:5173,http://localhost:8787,http://localhost:4173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
  otpSecret: process.env.OTP_SECRET ?? (isProd ? '' : 'dev-only-otp-secret-change-me'),
  sessionDaysRemember: 30,
  sessionHoursDefault: 12,
  smtp: {
    host: process.env.SMTP_HOST ?? '',
    port: Number(process.env.SMTP_PORT ?? 587),
    user: process.env.SMTP_USER ?? '',
    pass: process.env.SMTP_PASS ?? '',
    from: process.env.MAIL_FROM ?? 'AuraChess <no-reply@aurachess.local>'
  },
  ai: {
    // gemini-2.5-* is being retired 16 Oct 2026, so gemini-3.1-pro-preview is the
    // current non-deprecated "pro" tier model (per ai.google.dev/gemini-api/docs/deprecations,
    // checked when this was written). It's slower than a flash model — if the in-game
    // coach ever feels sluggish, set GEMINI_MODEL=gemini-3-flash-preview instead.
    geminiKey: process.env.GEMINI_API_KEY ?? '',
    geminiModel: process.env.GEMINI_MODEL ?? 'gemini-3.1-pro-preview',
    geminiBase: process.env.GEMINI_BASE_URL ?? 'https://generativelanguage.googleapis.com',
    // llama-3.3-70b-versatile was decommissioned by Groq on 16 Aug 2026 — using it would
    // 404 on every request. openai/gpt-oss-120b is Groq's own current recommended,
    // free-tier-available replacement (per console.groq.com/docs/deprecations).
    groqKey: process.env.GROQ_API_KEY ?? '',
    groqModel: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b',
    groqBase: process.env.GROQ_BASE_URL ?? 'https://api.groq.com/openai/v1'
  }
}

if (isProd && !config.otpSecret) {
  throw new Error('OTP_SECRET must be set in production (any long random string).')
}
