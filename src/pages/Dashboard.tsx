import { useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { Button } from '../components/Button'
import { biometricStatus, enableBiometric, platformAuthenticatorAvailable, removeBiometric } from '../lib/webauthn'

export default function Dashboard() {
  const { user, isLoading } = useAuth()
  const [bioAvailable, setBioAvailable] = useState(false)
  const [bioOn, setBioOn] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  useEffect(() => {
    void platformAuthenticatorAvailable().then(setBioAvailable)
    if (user) void biometricStatus().then((s) => setBioOn(s.registered)).catch(() => undefined)
  }, [user])

  if (isLoading) return null
  if (!user) return <Navigate to="/login" replace />

  const winRate = user.gamesPlayed > 0 ? Math.round((user.wins / user.gamesPlayed) * 100) : 0
  const stats = [
    { label: 'Rating', value: user.rating },
    { label: 'Games', value: user.gamesPlayed },
    { label: 'Win rate', value: `${winRate}%` },
    { label: 'W · L · D', value: `${user.wins} · ${user.losses} · ${user.draws}` }
  ]

  async function toggleBio() {
    setMsg(null)
    try {
      if (bioOn) { await removeBiometric(); setBioOn(false); setMsg('Biometric sign-in removed from all devices.') }
      else { await enableBiometric(); setBioOn(true); setMsg('Biometric sign-in is on for this device.') }
    } catch (e) { setMsg(e instanceof Error ? e.message : 'Something went wrong.') }
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-2xl">{user.username}</h1>
      <p className="mt-1 text-sm text-muted">{user.email}</p>
      <dl className="mt-8 grid grid-cols-2 gap-6 sm:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label}><dt className="text-xs text-muted">{s.label}</dt><dd className="mt-1 font-display text-2xl">{s.value}</dd></div>
        ))}
      </dl>
      {bioAvailable && (
        <div className="mt-12 border-t border-border pt-6">
          <h2 className="font-display text-lg">Biometric sign-in</h2>
          <p className="mt-1 text-sm text-muted">Use your fingerprint, face or device PIN instead of typing a password.</p>
          <Button variant="secondary" className="mt-4" onClick={toggleBio}>{bioOn ? 'Turn off' : 'Turn on for this device'}</Button>
          {msg && <p role="status" className="mt-3 text-sm text-muted">{msg}</p>}
        </div>
      )}
    </div>
  )
}
