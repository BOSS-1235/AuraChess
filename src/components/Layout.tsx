import { Outlet } from 'react-router-dom'
import { Navbar } from './Navbar'

export function Layout() {
  return (
    <div className="flex min-h-screen flex-col bg-bg text-ink">
      <Navbar />
      <main className="flex-1">
        <Outlet />
      </main>
      <footer className="border-t border-border px-6 py-8 text-center text-xs text-muted">
        AuraChess — built for people who'd rather play than wait.
      </footer>
    </div>
  )
}
