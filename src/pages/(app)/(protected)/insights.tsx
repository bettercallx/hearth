import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { useMutations, useQuery, useUser } from 'deepspace'
import { markLetterSeen } from '@/lib/letters'
import { Sparkles, Plus, Check, Info } from 'lucide-react'
import { Button, ConfirmModal, buttonVariants, useToast } from '@/components/ui'
import { MoodChart } from '@/components/hearth/MoodChart'
import { FIRST_MONTH, MonthCalendar } from '@/components/hearth/MonthCalendar'
import { EntryCard } from '@/components/hearth/bits'
import { HabitsSection } from '@/components/hearth/HabitsSection'
import { callAction, formatDay, localToday } from '@/lib/client'
import { addDays, computeStats, findPatterns, type Confidence, type DayPoint, type Pattern } from '@/lib/patterns'
import { normalizeSignals } from '@/lib/signals'
import type { Habit, Insight } from '@/lib/types'
import type { Suggestion } from '@/server/journal-ai'
import { cn } from '@/lib/utils'
import { useMyEntries } from '@/lib/social'

const RANGES = [7, 10, 14] as const

const LAW_LABEL: Record<Suggestion['law'], string> = {
  obvious: 'Make it obvious',
  attractive: 'Make it attractive',
  easy: 'Make it easy',
  satisfying: 'Make it satisfying',
}

const CONFIDENCE_STYLE: Record<Confidence, string> = {
  consistent: 'border-primary/50 text-primary',
  emerging: 'border-[var(--hearth-energy-line)]/50 text-[var(--hearth-energy-line)]',
  tentative: 'border-border text-muted-foreground',
}

export default function InsightsPage() {
  const today = localToday()
  const [days, setDays] = useState<(typeof RANGES)[number]>(10)
  const [generating, setGenerating] = useState(false)
  const { error, success } = useToast()

  const { records: entries, status } = useMyEntries({ orderBy: 'createdAt', orderDir: 'asc', limit: 500 })

  // ── Calendar + the selected day's entries (this is the journal) ──
  const [params, setParams] = useSearchParams()
  const dayParam = params.get('day')
  const byDate = useMemo(() => {
    const m = new Map<string, typeof entries>()
    for (const e of entries) m.set(e.data.entryDate, [...(m.get(e.data.entryDate) ?? []), e])
    return m
  }, [entries])
  const lastDay = useMemo(() => [...byDate.keys()].sort().at(-1) ?? null, [byDate])
  // Month arrows override the month only until a day is picked or linked to.
  const [monthOverride, setMonthOverride] = useState<{ month: string; forDay: string | null } | null>(null)
  const naturalMonth = (dayParam ?? lastDay ?? today).slice(0, 7)
  const month =
    monthOverride && monthOverride.forDay === dayParam
      ? monthOverride.month
      : naturalMonth < FIRST_MONTH
        ? FIRST_MONTH
        : naturalMonth
  const selected =
    dayParam && dayParam.startsWith(month)
      ? dayParam
      : ([...byDate.keys()].filter((d) => d.startsWith(month)).sort().at(-1) ?? null)
  const dayRows = selected ? [...(byDate.get(selected) ?? [])].reverse() : []

  // #habits / #letter links (from Today, old /habits) scroll once the data is in.
  const { hash } = useLocation()
  useEffect(() => {
    if (status === 'ready' && (hash === '#habits' || hash === '#letter'))
      document.getElementById(hash.slice(1))?.scrollIntoView({ behavior: 'smooth' })
  }, [hash, status])

  // Following an evidence link (?day=…) brings that day into view.
  useEffect(() => {
    if (dayParam) document.getElementById('day-panel')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [dayParam])

  const { records: insights } = useQuery<Insight>('insights', { orderBy: 'createdAt', orderDir: 'desc', limit: 20 })

  const start = addDays(today, -(days - 1))
  const points: DayPoint[] = useMemo(
    () =>
      entries
        .filter((e) => e.data.status === 'analyzed' && e.data.entryDate >= start && e.data.entryDate <= today)
        .map((e) => ({ date: e.data.entryDate, signals: normalizeSignals(e.data.signals) })),
    [entries, start, today],
  )
  // Computed in the browser from your own synced entries: instant, free, and
  // exactly what the server would compute — the AI only adds words on top.
  const stats = useMemo(() => computeStats(points), [points])
  const patterns = useMemo(() => findPatterns(points), [points])

  const series = useMemo(
    () =>
      Array.from({ length: days }, (_, i) => {
        const date = addDays(start, i)
        const s = stats.series.find((p) => p.date === date)
        return { date, mood: s?.mood ?? null, energy: s?.energyAfternoon ?? null }
      }),
    [days, start, stats],
  )

  const latest = insights[0] ?? null
  const notes = new Map((latest?.data.patterns ?? []).filter((p) => p.note).map((p) => [p.id, p.note!]))

  const lookBack = async () => {
    setGenerating(true)
    try {
      await callAction('generateInsight', { days, today })
      success('Hearth wrote you a letter')
    } catch (e) {
      error('No look-back yet', e instanceof Error ? e.message : undefined)
    } finally {
      setGenerating(false)
    }
  }

  return (
    <div className="mx-auto max-w-5xl px-5 pb-24 pt-10">
      <h1 className="sr-only">Looking back</h1>
      {status === 'loading' ? (
        <div className="h-80 animate-pulse rounded-2xl bg-muted" />
      ) : (
        <div className="grid gap-8 lg:grid-cols-[26rem_minmax(0,1fr)]">
          <MonthCalendar
            byDate={byDate}
            month={month}
            onMonthChange={(m) => setMonthOverride({ month: m, forDay: dayParam })}
            selected={selected}
            onSelect={(d) => setParams({ day: d }, { replace: true })}
          />
          {/* On wide screens the day's entries take exactly the calendar's height and
              scroll inside it, so a busy day never stretches the page. */}
          <section id="day-panel" data-testid="day-panel" className="lg:relative">
            <div className="flex flex-col gap-3 lg:absolute lg:inset-0 lg:pt-14">
            {selected && dayRows.length > 0 ? (
              <>
                <h2 className="flex items-baseline justify-between text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  {formatDay(selected, { weekday: 'long', month: 'short', day: 'numeric' })}
                  <span className="normal-case tracking-normal">
                    {dayRows.length} {dayRows.length === 1 ? 'entry' : 'entries'}
                  </span>
                </h2>
                <div data-testid="day-entries" className="-mr-2 min-h-0 flex-1 space-y-3 overflow-y-auto pr-2">
                  {dayRows.map((r) => (
                    <EntryCard key={r.recordId} id={r.recordId} createdAt={r.createdAt} entry={r.data} />
                  ))}
                </div>
              </>
            ) : (
              <p className="rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                {entries.length ? (
                  'Pick a colored day to read what you wrote.'
                ) : (
                  <>
                    Your days will fill this calendar.{' '}
                    <Link to="/home" className="text-foreground underline underline-offset-4">
                      Write your first entry
                    </Link>
                    .
                  </>
                )}
              </p>
            )}
            </div>
          </section>
        </div>
      )}
      <div className="max-w-3xl">
        <div className="mt-14 border-t border-border pt-10">
          <HabitsSection />
        </div>

      <div className="mt-14 flex flex-wrap items-end justify-between gap-4 border-t border-border pt-10">
        <div>
          <h2 className="font-display text-2xl font-light text-foreground">What Hearth is noticing</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {stats.daysLogged} of the last {days} days written · {formatDay(start)} – {formatDay(today)}
          </p>
        </div>
        <div className="flex items-center gap-1 rounded-full border border-border bg-card p-1" role="radiogroup" aria-label="Range">
          {RANGES.map((r) => (
            <button
              key={r}
              role="radio"
              aria-checked={days === r}
              onClick={() => setDays(r)}
              className={cn(
                'rounded-full px-3.5 py-1 text-sm transition-colors',
                days === r ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {r} days
            </button>
          ))}
        </div>
      </div>

      {status === 'loading' ? null : stats.daysLogged === 0 ? (
        <div className="mt-10 rounded-2xl border border-dashed border-border p-8 text-center">
          <p className="text-muted-foreground">No entries in this range yet.</p>
          <Link to="/home" className={cn(buttonVariants(), 'mt-4')}>
            Talk to Hearth
          </Link>
        </div>
      ) : (
        <>
          <section className="mt-6 rounded-2xl border border-border bg-card p-5">
            <MoodChart points={series} />
          </section>

          {/* Patterns */}
          <section className="mt-6" data-testid="patterns">
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
              Compared across your own days, not other people. These are hints from a small number of days, not causes —
              tap a date to read what you wrote.
            </p>
            {patterns.length === 0 ? (
              <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                {stats.daysLogged < 4
                  ? `Patterns appear after about four days of entries. You have ${stats.daysLogged}.`
                  : 'Nothing stands out yet — your days have been fairly even. Keep writing; differences take time to show.'}
              </p>
            ) : (
              <div className="mt-5 space-y-3">
                {patterns.map((p) => (
                  <PatternCard key={p.id} pattern={p} note={notes.get(p.id)} />
                ))}
              </div>
            )}
          </section>

          {/* AI look-back */}
          <section id="letter" className="mt-12 scroll-mt-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-2xl font-light text-foreground">A letter from Hearth</h2>
              <Button onClick={() => void lookBack()} loading={generating} disabled={stats.daysLogged < 3} data-testid="generate-insight">
                <Sparkles className="h-4 w-4" aria-hidden /> Write me about these {days} days
              </Button>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              A new letter about your week also arrives every Sunday evening.
            </p>
            {latest ? (
              <InsightView id={latest.recordId} insight={latest.data} />
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-border p-5 text-sm text-muted-foreground">
                {stats.daysLogged < 3
                  ? 'Write on at least three days and Hearth can tell you the story of your week.'
                  : 'Ask Hearth for a letter about these days: what it saw, how they felt, and one or two small things to try.'}
              </p>
            )}
          </section>
        </>
      )}
      </div>
    </div>
  )
}

function PatternCard({ pattern, note }: { pattern: Pattern; note?: string }) {
  return (
    <article data-testid="pattern-card" data-pattern-id={pattern.id} className="rounded-xl border border-border bg-card p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-[15px] leading-relaxed text-foreground">{pattern.statement}</p>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[11px] capitalize', CONFIDENCE_STYLE[pattern.confidence])}>
          {pattern.confidence}
        </span>
      </div>
      {note && <p className="mt-2 font-display text-[15px] italic text-muted-foreground">{note}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        <span className="text-xs text-muted-foreground">Based on</span>
        {pattern.evidence.map((d) => (
          <Link
            key={d}
            to={`/insights?day=${d}`}
            className="rounded-full bg-secondary px-2 py-0.5 text-xs text-foreground/80 hover:bg-accent hover:text-foreground"
          >
            {formatDay(d, { month: 'short', day: 'numeric' })}
          </Link>
        ))}
      </div>
    </article>
  )
}

function InsightView({ id, insight }: { id: string; insight: Insight }) {
  const { records: habits } = useQuery<Habit>('habits')
  const { ready, createConfirmed } = useMutations<Habit>('habits')
  const { removeConfirmed } = useMutations<Insight>('insights')
  const { user } = useUser()
  const firstName = (user?.name || 'friend').split(' ')[0]
  // Opening the letter marks it read for the notice on Today.
  useEffect(() => markLetterSeen(id), [id])
  const [confirmDelete, setConfirmDelete] = useState(false)
  const { success, error } = useToast()
  const adopted = new Set(habits.map((h) => h.data.name))

  const adopt = async (s: Suggestion) => {
    try {
      await createConfirmed({
        name: s.title,
        identity: '',
        stack: s.stack,
        twoMinute: s.twoMinute,
        signal: s.signal ?? '',
        active: true,
      })
      success('Added to your habits', 'Hearth will track it from your entries.')
    } catch (e) {
      error('Could not add habit', e instanceof Error ? e.message : undefined)
    }
  }

  return (
    <div data-testid="insight" data-insight-id={id} className="mt-5 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {insight.trigger === 'weekly' ? 'Weekly' : `${insight.days}-day`} look-back · {formatDay(insight.rangeStart)} –{' '}
          {formatDay(insight.rangeEnd)}
        </p>
        <button
          type="button"
          data-testid="delete-insight"
          onClick={() => setConfirmDelete(true)}
          className="text-xs text-muted-foreground underline-offset-4 hover:text-destructive hover:underline"
        >
          Delete
        </button>
      </div>
      <ConfirmModal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        onConfirm={() => {
          setConfirmDelete(false)
          removeConfirmed(id).catch((e: unknown) => error('Could not delete', e instanceof Error ? e.message : undefined))
        }}
        title="Delete this look-back?"
        description="Your entries stay. You can write a new look-back any time."
        confirmText="Delete"
        variant="destructive"
      />
      <div className="space-y-4 rounded-2xl border border-border bg-card px-6 py-7 sm:px-8">
        <p className="font-display text-lg text-foreground">Dear {firstName},</p>
        {insight.narrative.split(/\n\n+/).map((para, i) => (
          <p key={i} className="text-[15px] leading-relaxed text-foreground/90">
            {para}
          </p>
        ))}
        <p className="font-display text-lg italic text-foreground">— Hearth</p>
      </div>

      {insight.identity && (
        <blockquote className="border-l-2 border-primary pl-4 font-display text-xl font-light italic text-foreground">{insight.identity}</blockquote>
      )}

      {insight.highlights.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Moments worth keeping</p>
          <ul className="mt-2 space-y-1.5">
            {insight.highlights.map((h) => (
              <li key={h.date + h.text} className="flex gap-3 text-sm">
                <span className="w-16 shrink-0 text-muted-foreground">{formatDay(h.date, { month: 'short', day: 'numeric' })}</span>
                <span className="text-foreground/90">{h.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {insight.suggestions.length > 0 && (
        <div>
          <p className="text-xs uppercase tracking-wider text-muted-foreground">Small things to try</p>
          <div className="mt-3 grid gap-3">
            {insight.suggestions.map((s) => {
              const pattern = insight.patterns.find((p) => p.id === s.patternId)
              const isAdopted = adopted.has(s.title)
              return (
                <article key={s.title} data-testid="suggestion" className="rounded-xl border border-border bg-card p-5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-primary/15 px-2.5 py-0.5 text-[11px] font-medium text-primary">{LAW_LABEL[s.law]}</span>
                    <h3 className="text-[15px] font-medium text-foreground">{s.title}</h3>
                  </div>
                  {s.why && <p className="mt-2 text-sm text-muted-foreground">{s.why}</p>}
                  {pattern && <p className="mt-1 text-xs text-muted-foreground/80">From: {pattern.statement}</p>}
                  <dl className="mt-3 space-y-1.5 text-sm">
                    {s.stack && (
                      <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-muted-foreground">Stack it</dt>
                        <dd className="text-foreground">{s.stack}</dd>
                      </div>
                    )}
                    {s.twoMinute && (
                      <div className="flex gap-2">
                        <dt className="w-20 shrink-0 text-muted-foreground">2 minutes</dt>
                        <dd className="text-foreground">{s.twoMinute}</dd>
                      </div>
                    )}
                  </dl>
                  <Button
                    variant={isAdopted ? 'ghost' : 'secondary'}
                    size="sm"
                    className="mt-4"
                    disabled={!ready || isAdopted}
                    onClick={() => void adopt(s)}
                  >
                    {isAdopted ? <Check className="h-4 w-4" aria-hidden /> : <Plus className="h-4 w-4" aria-hidden />}
                    {isAdopted ? 'In your habits' : 'Make it a habit'}
                  </Button>
                </article>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
