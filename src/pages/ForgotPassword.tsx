import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { PasswordInput, textInputClass } from '../components/PasswordInput'
import { api } from '../lib/api'

type Step = 'email' | 'code' | 'done'

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [cooldown, setCooldown] = useState(0)

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  async function requestCode(e?: React.FormEvent) {
    e?.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const res = await api<{ message: string }>('/auth/forgot', { body: { email } })
      setNotice(res.message)
      setStep('code')
      setCooldown(60)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (password.length < 8) return setError('Password must be at least 8 characters.')
    if (password !== confirm) return setError('Passwords do not match.')
    setBusy(true)
    try {
      await api('/auth/reset', { body: { email, otp, newPassword: password } })
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto flex max-w-sm flex-col px-6 py-20">
      {step === 'email' && (
        <>
          <h1 className="font-display text-2xl">Reset your password</h1>
          <p className="mt-1 text-sm text-muted">Enter your email and we’ll send you a 6-digit code.</p>
          <form onSubmit={requestCode} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">Email</span>
              <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} className={textInputClass} />
            </label>
            {error && <p role="alert" className="text-sm text-bad">{error}</p>}
            <Button type="submit" disabled={busy} className="w-full">{busy ? 'Sending…' : 'Send code'}</Button>
            <Link to="/login" className="text-center text-sm text-muted hover:text-ink transition-colors">Back to sign in</Link>
          </form>
        </>
      )}

      {step === 'code' && (
        <>
          <h1 className="font-display text-2xl">Enter your code</h1>
          {notice && <p className="mt-1 text-sm text-muted">{notice}</p>}
          <form onSubmit={resetPassword} className="mt-8 flex flex-col gap-4">
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">6-digit code</span>
              <input
                inputMode="numeric"
                pattern="\d{6}"
                maxLength={6}
                required
                autoComplete="one-time-code"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                className={`${textInputClass} text-center font-mono text-lg tracking-[0.5em]`}
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">New password</span>
              <PasswordInput required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1.5 text-sm">
              <span className="text-muted">Confirm new password</span>
              <PasswordInput required autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </label>
            {error && <p role="alert" className="text-sm text-bad">{error}</p>}
            <Button type="submit" disabled={busy || otp.length !== 6} className="w-full">{busy ? 'Saving…' : 'Set new password'}</Button>
            <button
              type="button"
              disabled={cooldown > 0 || busy}
              onClick={() => void requestCode()}
              className="text-sm text-muted hover:text-ink transition-colors disabled:opacity-50"
            >
              {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
            </button>
          </form>
        </>
      )}

      {step === 'done' && (
        <>
          <h1 className="font-display text-2xl">Password updated</h1>
          <p className="mt-2 text-sm text-muted">You’ve been signed out everywhere. Sign in with your new password.</p>
          <Link to="/login" className="mt-8 inline-flex w-full items-center justify-center rounded-md bg-accent px-4 py-2.5 text-sm font-medium text-accent-contrast hover:opacity-90">
            Go to sign in
          </Link>
        </>
      )}
    </div>
  )
}
