import { useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAuth } from '../context/AuthContext'

interface Player { username: string; rating: number; gamesPlayed: number; wins: number; losses: number; draws: number }

export default function Leaderboard() {
  const { user } = useAuth()
  const [players, setPlayers] = useState<Player[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    api<{ players: Player[] }>('/leaderboard').then((r) => setPlayers(r.players)).catch((e: Error) => setError(e.message))
  }, [])

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="font-display text-2xl">Leaderboard</h1>
      <p className="mt-2 text-sm text-muted">Everyone who has finished a game here, ranked by rating. Coach games are unrated; only Rated games move your number.</p>
      {error && <p className="mt-8 text-sm text-bad">{error}</p>}
      {players && players.length === 0 && (
        <div className="mt-12 rounded-md border border-dashed border-border py-16 text-center text-sm text-muted">
          No one on the board yet. Finish a game to take the #1 spot.
        </div>
      )}
      {players && players.length > 0 && (
        <table className="mt-8 w-full text-sm">
          <thead>
            <tr className="border-b border-border text-left text-muted">
              <th className="py-2 font-normal">#</th><th className="py-2 font-normal">Player</th>
              <th className="py-2 text-right font-normal">Rating</th><th className="py-2 text-right font-normal">W-L-D</th>
            </tr>
          </thead>
          <tbody>
            {players.map((p, i) => (
              <tr key={p.username} className={`border-b border-border/60 ${p.username === user?.username ? 'text-accent' : ''}`}>
                <td className="py-2.5">{i + 1}</td>
                <td className="py-2.5">{p.username}</td>
                <td className="py-2.5 text-right tabular-nums">{p.rating}</td>
                <td className="py-2.5 text-right tabular-nums text-muted">{p.wins}-{p.losses}-{p.draws}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
