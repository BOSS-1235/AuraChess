import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button } from '../components/Button'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../context/AuthContext'

interface Msg { role: 'user' | 'assistant'; content: string }

export default function Study() {
  const { user, isLoading } = useAuth()
  const [providers, setProviders] = useState<string[] | null>(null)
  const [provider, setProvider] = useState<string | undefined>()
  const [messages, setMessages] = useState<Msg[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    api<{ providers: string[] }>('/ai/providers').then((r) => { setProviders(r.providers); setProvider(r.providers[0]) }).catch(() => setProviders([]))
  }, [])
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'nearest' }) }, [messages])

  async function send() {
    const text = input.trim()
    if (!text || busy) return
    const next: Msg[] = [...messages, { role: 'user', content: text }]
    setMessages([...next, { role: 'assistant', content: '' }])
    setInput(''); setBusy(true); setError(null)
    try {
      const res = await fetch('/api/ai/chat', {
        method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider, messages: next })
      })
      if (!res.ok || !res.body) {
        const d = await res.json().catch(() => ({}))
        throw new ApiError((d as { error?: string }).error ?? 'The tutor is unavailable.', res.status)
      }
      const reader = res.body.getReader(); const dec = new TextDecoder(); let acc = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        acc += dec.decode(value, { stream: true })
        setMessages([...next, { role: 'assistant', content: acc }])
      }
    } catch (e) {
      setMessages(next)
      setError(e instanceof Error ? e.message : 'Something went wrong.')
    } finally { setBusy(false) }
  }

  if (isLoading) return null
  return (
    <div className="mx-auto flex max-w-2xl flex-col px-6 py-12">
      <h1 className="font-display text-2xl">Study</h1>
      <p className="mt-1 text-sm text-muted">Ask about an opening, a mistake you keep making, or how to think about a position.</p>

      {!user ? (
        <p className="mt-8 rounded-md border border-border bg-surface p-4 text-sm text-muted">
          <Link to="/login" className="text-ink underline">Sign in</Link> to talk to the tutor.
        </p>
      ) : providers && providers.length === 0 ? (
        <p className="mt-8 rounded-md border border-border bg-surface p-4 text-sm text-muted">
          No AI provider is configured on the server yet. Add <code>GEMINI_API_KEY</code> (or <code>ANTHROPIC_API_KEY</code>) to the server’s <code>.env</code> and restart.
        </p>
      ) : (
        <>
          {providers && providers.length > 1 && (
            <div className="mt-6 flex w-fit gap-1 rounded-md border border-border p-1 text-sm">
              {providers.map((p) => (
                <button key={p} onClick={() => setProvider(p)} className={`rounded px-3 py-1 ${provider === p ? 'bg-accent text-accent-contrast' : 'text-muted hover:text-ink'}`}>
                  {p === 'gemini' ? 'Gemini' : 'Groq'}
                </button>
              ))}
            </div>
          )}
          <div className="mt-6 min-h-48 flex-1 space-y-4" aria-live="polite">
            {messages.length === 0 && <p className="text-sm text-muted">Ask your first question below.</p>}
            {messages.map((m, i) => (
              <div key={i} className={m.role === 'user' ? 'text-right' : ''}>
                <div className={`inline-block max-w-[85%] whitespace-pre-wrap rounded-md px-3.5 py-2.5 text-left text-sm ${m.role === 'user' ? 'bg-accent text-accent-contrast' : 'border border-border bg-surface'}`}>
                  {m.content || '…'}
                </div>
              </div>
            ))}
            {error && <p role="alert" className="text-sm text-bad">{error}</p>}
            <div ref={endRef} />
          </div>
          <div className="mt-4 flex gap-2">
            <textarea
              value={input} onChange={(e) => setInput(e.target.value)} rows={2} maxLength={4000}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void send() } }}
              placeholder="e.g. Why is the Italian Game good for beginners?"
              className="flex-1 resize-none rounded-md border border-border bg-surface px-3 py-2.5 text-sm focus:border-accent focus:outline-none"
            />
            <Button onClick={() => void send()} disabled={busy || !input.trim()}>Send</Button>
          </div>
        </>
      )}
    </div>
  )
}
