/** Landing page: the pitch on one side, a still of the real product (a reflection and a pattern card) on the other. */

import { Link } from 'react-router-dom'

export default function Landing() {
  return (
    <>
      <div data-testid="static-landing" className="min-h-screen bg-background text-foreground">
        <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
          <span className="font-display text-xl">Hearth</span>
          <Link to="/home" className="text-sm text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        </header>

        <main className="mx-auto grid max-w-6xl items-center gap-14 px-6 pb-24 pt-10 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
          <section>
            <h1 className="font-display text-5xl font-light leading-[1.05] sm:text-6xl">
              Say how today went.
              <br />
              <em className="text-primary">Hearth listens.</em>
            </h1>
            <p className="mt-6 max-w-lg text-lg leading-relaxed text-muted-foreground">
              Talk or type for a minute at the end of the day. Hearth reflects back what it heard, and over a week or
              two it shows you, with the days to prove it, what lifts you and what quietly wears you down.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/home"
                className="inline-flex items-center rounded-full bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-opacity hover:opacity-90"
              >
                Start your first entry
              </Link>
              <span className="text-sm text-muted-foreground">Private to you. Not even the app's admins can read it.</span>
            </div>

            <dl className="mt-14 grid max-w-lg gap-6 border-t border-border pt-8 text-sm sm:grid-cols-2">
              <div>
                <dt className="font-medium text-foreground">Patterns with receipts</dt>
                <dd className="mt-1 text-muted-foreground">
                  Every finding shows its numbers and links to the exact days behind it. Hearth only suggests, it never diagnoses.
                </dd>
              </div>
              <div>
                <dt className="font-medium text-foreground">Habits that fill themselves in</dt>
                <dd className="mt-1 text-muted-foreground">
                  Built on <em>Atomic Habits</em>: tiny, stacked habits Hearth tracks from what you say. Never miss twice.
                </dd>
              </div>
            </dl>
          </section>

          <section aria-label="What Hearth looks like" className="relative">
            <div className="relative space-y-4">
              <figure className="rounded-2xl border border-border bg-card p-6">
                <blockquote className="text-sm leading-relaxed text-muted-foreground">
                  “Back-to-back meetings, never got lunch. By 4pm I couldn't think straight…”
                </blockquote>
                <figcaption className="mt-4 font-display text-lg font-light leading-relaxed text-foreground">
                  That's a lot to absorb on an empty stomach. Of course the afternoon felt foggy.
                </figcaption>
                <div className="mt-3 flex gap-1.5">
                  {['drained', 'anxious'].map((t) => (
                    <span key={t} className="rounded-full border border-border bg-secondary px-2.5 py-0.5 text-xs text-muted-foreground">
                      {t}
                    </span>
                  ))}
                </div>
              </figure>
              <figure className="ml-0 rounded-2xl border border-border bg-card p-6 sm:ml-10">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-[15px] leading-relaxed text-foreground">
                    On days you skipped or delayed lunch, your mood averaged 2.2/5 vs 3.9/5 on days you ate on time.
                  </p>
                  <span className="shrink-0 rounded-full border border-primary/50 px-2 py-0.5 text-[11px] text-primary">Consistent</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
                  <span className="text-muted-foreground">Based on</span>
                  {['Nov 2', 'Nov 3', 'Nov 5', 'Nov 8'].map((d) => (
                    <span key={d} className="rounded-full bg-secondary px-2 py-0.5 text-foreground/80">
                      {d}
                    </span>
                  ))}
                </div>
                <p className="mt-4 text-sm text-muted-foreground">
                  <span className="mr-2 rounded-full bg-primary/15 px-2 py-0.5 text-[11px] font-medium text-primary">Make it obvious</span>
                  After my morning schedule check, I'll block 30 minutes for lunch.
                </p>
              </figure>
            </div>
          </section>
        </main>

        <footer className="mx-auto max-w-6xl border-t border-border px-6 py-8 text-xs text-muted-foreground">
          Hearth is a journaling companion, not therapy or medical advice. If you're in crisis in the US, call or text 988.
        </footer>
      </div>
    </>
  )
}
