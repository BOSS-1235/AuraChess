import { Link } from 'react-router-dom'

const offerings = [
  {
    title: 'Play',
    body: 'A local engine replies the instant you move — no waiting on a language model to "think." Pick your difficulty and go.'
  },
  {
    title: 'Study',
    body: 'Ask an AI tutor to explain a position, a mistake, or an opening idea, in plain language, at your own pace.'
  },
  {
    title: 'Compete',
    body: 'Track your rating across games and see how you stack up against friends, with a real Elo system behind it.'
  }
]

export default function Home() {
  return (
    <div>
      <section className="mx-auto max-w-3xl px-6 pb-20 pt-24 text-center sm:pt-32">
        <h1 className="animate-fade-up font-display text-4xl leading-[1.1] tracking-tight sm:text-5xl">
          Chess, without the noise.
        </h1>
        <p
          className="mx-auto mt-5 max-w-prose animate-fade-up text-lg text-muted"
          style={{ animationDelay: '80ms' }}
        >
          Play instantly against a fast local engine, study your games with an AI tutor,
          and watch your rating move — one clear screen at a time.
        </p>
        <div className="mt-9 flex animate-fade-up items-center justify-center gap-3" style={{ animationDelay: '150ms' }}>
          <Link
            to="/play"
            className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-medium text-accent-contrast hover:opacity-90 transition-opacity"
          >
            Play now
          </Link>
          <Link
            to="/study"
            className="inline-flex items-center gap-2 rounded-md border border-border px-5 py-2.5 text-sm font-medium text-ink hover:bg-border/30 transition-colors"
          >
            Study with a tutor
          </Link>
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto grid max-w-5xl gap-10 px-6 py-16 sm:grid-cols-3 sm:gap-8">
          {offerings.map((item) => (
            <div key={item.title}>
              <h2 className="font-display text-xl">{item.title}</h2>
              <p className="mt-2 text-sm leading-relaxed text-muted">{item.body}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
