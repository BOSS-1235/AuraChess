import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/Button'
import { PasswordInput, textInputClass } from '../components/PasswordInput'
import { platformAuthenticatorAvailable, signInWithBiometric } from '../lib/webauthn'

export default function Login() {
  const { signIn, setUser } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)

  useEffect(() => {
    void platformAuthenticatorAvailable().then(setBioAvailable)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      await signIn(email, password, remember)
      navigate('/play')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function handleBiometric() {
    setError(null)
    setBusy(true)
    try {
      setUser(await signInWithBiometric(remember))
      navigate('/play')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Biometric sign-in failed.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col px-6 py-20">
      <h1 className="font-display text-2xl">Sign in</h1>
      <p className="mt-1 text-sm text-muted">Welcome back.</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Email</span>
          <input type="email" required autoComplete="email username webauthn" value={email} onChange={(e) => setEmail(e.target.value)} className={textInputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Password</span>
          <PasswordInput required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-muted">
            <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--color-accent))]" />
            Remember me
          </label>
          <Link to="/forgot" className="text-muted hover:text-ink transition-colors">
            Forgot password?
          </Link>
        </div>

        {error && <p role="alert" className="text-sm text-bad">{error}</p>}

        <Button type="submit" disabled={busy} className="mt-2 w-full">
          {busy ? 'Signing in…' : 'Sign in'}
        </Button>

        {bioAvailable && (
          <>
            <div className="flex items-center gap-3 text-xs text-muted">
              <span className="h-px flex-1 bg-border" />
              or
              <span className="h-px flex-1 bg-border" />
            </div>
            <button
              type="button"
              onClick={handleBiometric}
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-border py-2.5 text-sm font-medium text-ink hover:bg-border/30 transition-colors disabled:opacity-50"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
                <path d="M12 11a2 2 0 0 1 2 2v1a6 6 0 0 1-1 3.5M8 15v-2a4 4 0 0 1 7.5-2M6 12a6 6 0 0 1 10-4.5M4.5 9.5A9 9 0 0 1 18.5 5M3 15.5A11 11 0 0 0 5.5 19M19 11.5a7 7 0 0 1-1.5 6.5" />
              </svg>
              Continue with biometrics
            </button>
          </>
        )}

        <p className="mt-4 text-center text-sm text-muted">
          No account?{' '}
          <Link to="/register" className="text-ink underline underline-offset-2">Create one</Link>
        </p>
      </form>
    </div>
  )
}
