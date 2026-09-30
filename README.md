# AuraChess (web)

Vite + React + TypeScript + Tailwind frontend, Express + SQLite backend. Real accounts,
real WebAuthn biometrics, an AI coach that plays and talks while you play, and OTP email
password reset.

## Run it

```bash
npm install
cp .env.example .env
# edit .env: paste your GEMINI_API_KEY and/or GROQ_API_KEY
npm run dev
```

This starts the Vite dev server (:5173) and the API server (:8787) together; Vite proxies
`/api/*` to the server, so the browser only ever talks to one origin. Open http://localhost:5173.

No `SMTP_*` in `.env`? Password-reset codes print in the terminal running `npm run dev`
instead of emailing — everything else works normally.

WebAuthn (biometric sign-in) requires `http://localhost` or a real HTTPS domain; it will
not work over plain HTTP on a LAN IP — that's a browser security rule, not a bug here.

## Production

```bash
npm run build   # type-checks both sides, builds the frontend into dist/
npm start       # one Node process serves the API and the built frontend together
```

Since one process serves both, `APP_ORIGINS` in `.env` should be your real domain
(e.g. `https://aurachess.yourdomain.com`) and nothing else — this is also what CSRF
protection and WebAuthn check against.

Any Node host works (Render, Railway, Fly.io, a VPS). `DB_PATH` points at the SQLite
file — on a host with an ephemeral filesystem, point it at a persistent volume/disk, or
your accounts vanish on redeploy.

## What changed from the old client-only build

- **Accounts are server-side now.** Passwords are hashed with scrypt (Node's own crypto,
  not a toy), sessions are httpOnly cookies, failed logins lock the account for 15 minutes
  after 5 attempts, and login responses don't reveal whether an email exists.
- **Password reset sends a real 6-digit code by email** (any SMTP provider — Gmail app
  password, Resend, Brevo, SES...), single-use, 10-minute expiry, and resets sign you out
  everywhere.
- **Biometric sign-in is server-verified WebAuthn** (`@simplewebauthn`), not a
  browser-only trick — the server checks a real cryptographic signature every time.
- **The AI coach plays as Black and talks while the game is live**: it reacts to your
  last move (best / good / inaccuracy / mistake / blunder, judged by the same local
  engine), tells you what to do next, and answers free-form questions — all streamed
  token by token. Your Gemini key lives only in `.env` on the server; the browser never
  sees it. Works with no key too (a built-in rule-based coach takes over), so it never
  looks broken.
- **Game results are verified server-side**: the PGN is replayed with `chess.js` on the
  server and the result is derived from the board, not trusted from the browser, before
  Elo changes are applied.
- **Rated vs unrated is explicit**: "Rated" games move your Elo; "Play with coach" games
  are for learning and don't.

## Still not done (didn't want to overreach silently)

- No move/opening explorer, no puzzles, no King's Tower RPG mode from the Android app.
- Study tutor is a plain chat; it doesn't yet look at your actual game history.
- No real-time networked multiplayer (two different devices playing live) — Pass & Play
  is same-device only. That needs WebSockets and is a good next step.
- No account-deletion / change-password-while-signed-in page yet (the API shape supports
  it easily — a `PATCH` users route — just not wired to a page).

## AI providers: Gemini + Groq

Claude/Anthropic has been removed (paid-only, no free tier) in favor of Groq, which has a
free tier. Either or both of `GEMINI_API_KEY` / `GROQ_API_KEY` can be set — the app uses
whichever is configured, and the model picker in Play/Study only shows providers that are
actually available.

Both default model IDs were checked against each provider's own deprecation docs at the
time this was written (models get retired often — worth a quick check again before a real
launch):
- `GEMINI_MODEL=gemini-3.1-pro-preview` — the current non-deprecated Gemini Pro model.
  `gemini-2.5-pro`/`gemini-2.5-flash` retire 16 Oct 2026; don't use those. If the live
  in-game coach feels slow, `gemini-3-flash-preview` trades some depth for speed.
- `GROQ_MODEL=openai/gpt-oss-120b` — Groq's current recommended free-tier model.
  `llama-3.3-70b-versatile` was decommissioned 16 Aug 2026 and will 404 immediately.

## Never put a real API key in a chat message

Any key pasted into a conversation should be treated as already exposed — revoke it in
that provider's console and generate a fresh one for `.env`, which is the only place a key
should ever live. Nothing in this project reads a key from anywhere else.
