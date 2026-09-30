import { NavLink, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { ThemeToggle } from './ThemeToggle'
import { Button } from './Button'

const links = [
  { to: '/play', label: 'Play' },
  { to: '/study', label: 'Study' },
  { to: '/leaderboard', label: 'Leaderboard' }
]

export function Navbar() {
  const { user, signOut } = useAuth()
  const navigate = useNavigate()

  return (
    <header className="border-b border-border">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-6 py-4">
        <NavLink to="/" className="font-display text-lg tracking-tight text-ink">
          AuraChess
        </NavLink>

        <nav className="hidden items-center gap-6 text-sm text-muted sm:flex">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) => (isActive ? 'text-ink' : 'hover:text-ink transition-colors')}
            >
              {link.label}
            </NavLink>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <ThemeToggle />
          {user ? (
            <>
            <button
              onClick={() => navigate('/dashboard')}
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              {user.username} <span className="tabular-nums">· {user.rating}</span>
            </button>
            <button
              onClick={async () => {
                await signOut()
                navigate('/')
              }}
              className="text-sm text-muted hover:text-ink transition-colors"
            >
              Sign out
            </button>
            </>
          ) : (
            <Button variant="secondary" className="px-3 py-2 text-sm" onClick={() => navigate('/login')}>
              Sign in
            </Button>
          )}
        </div>
      </div>
    </header>
  )
}
