import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/Button'
import { PasswordInput, textInputClass } from '../components/PasswordInput'
import { enableBiometric, platformAuthenticatorAvailable } from '../lib/webauthn'

export default function Register() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [wantBiometric, setWantBiometric] = useState(false)
  const [bioAvailable, setBioAvailable] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void platformAuthenticatorAvailable().then(setBioAvailable)
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    try {
      await register(username, email, password)
      if (wantBiometric) {
        try {
          await enableBiometric()
        } catch {
          // The account already exists; a cancelled biometric prompt shouldn't undo that.
          // They can enable it later from their profile.
        }
      }
      navigate('/play')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  const mismatch = confirm.length > 0 && password !== confirm

  return (
    <div className="mx-auto flex max-w-sm flex-col px-6 py-20">
      <h1 className="font-display text-2xl">Create your account</h1>
      <p className="mt-1 text-sm text-muted">Starts at 1200 — every rating here is earned.</p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Username</span>
          <input required minLength={3} maxLength={20} autoComplete="username" value={username} onChange={(e) => setUsername(e.target.value)} className={textInputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Email</span>
          <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={textInputClass} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Password <span className="text-xs">(8+ characters)</span></span>
          <PasswordInput required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="text-muted">Confirm password</span>
          <PasswordInput required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          {mismatch && <span className="text-xs text-bad">Passwords don’t match yet.</span>}
        </label>

        {bioAvailable && (
          <label className="flex items-center gap-2 text-sm text-muted">
            <input type="checkbox" checked={wantBiometric} onChange={(e) => setWantBiometric(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--color-accent))]" />
            Set up biometric sign-in on this device
          </label>
        )}

        {error && <p role="alert" className="text-sm text-bad">{error}</p>}

        <Button type="submit" disabled={busy} className="mt-2 w-full">
          {busy ? 'Creating account…' : 'Create account'}
        </Button>
        <p className="mt-4 text-center text-sm text-muted">
          Already have an account? <Link to="/login" className="text-ink underline underline-offset-2">Sign in</Link>
        </p>
      </form>
    </div>
  )
}
