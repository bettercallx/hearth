/**
 * A month of days, each square colored by that day's mood — the journal at a
 * glance, like a contribution graph. Days without an entry stay empty; tap a
 * day to see what you wrote.
 */

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDay, localToday } from '@/lib/client'
import type { Entry } from '@/lib/types'
import { cn } from '@/lib/utils'
import { MoodDot, Tag, moodColor, moodWord } from './bits'

type Row = { recordId: string; data: Entry }

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const pad = (n: number) => String(n).padStart(2, '0')

export function MonthCalendar({ entries }: { entries: Row[] }) {
  const today = localToday()
  const [month, setMonth] = useState(today.slice(0, 7)) // YYYY-MM
  const [selected, setSelected] = useState<string | null>(null)

  const byDate = useMemo(() => {
    const m = new Map<string, Row[]>()
    for (const e of entries) m.set(e.data.entryDate, [...(m.get(e.data.entryDate) ?? []), e])
    return m
  }, [entries])

  const [y, mo] = month.split('-').map(Number)
  const daysInMonth = new Date(y, mo, 0).getDate()
  // Monday-first: how many blank cells before the 1st.
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${pad(i + 1)}`),
  ]

  const dayMood = (date: string) => {
    const rated = (byDate.get(date) ?? []).filter((r) => typeof r.data.mood === 'number' && !r.data.riskFlag)
    return rated.length ? rated.reduce((a, r) => a + (r.data.mood as number), 0) / rated.length : null
  }

  const written = cells.filter((d): d is string => !!d && byDate.has(d))
  const moods = written.map(dayMood).filter((m): m is number => m !== null)
  const avg = moods.length ? Math.round((moods.reduce((a, b) => a + b, 0) / moods.length) * 10) / 10 : null

  const shift = (delta: number) => {
    const d = new Date(y, mo - 1 + delta, 1)
    setMonth(`${d.getFullYear()}-${pad(d.getMonth() + 1)}`)
    setSelected(null)
  }

  const selectedRows = selected ? (byDate.get(selected) ?? []) : []

  return (
    <section data-testid="month-calendar">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-light text-foreground">
          {new Date(y, mo - 1, 1).toLocaleDateString(undefined, {
            month: 'long',
            year: 'numeric',
          })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shift(-1)}
            aria-label="Previous month"
            className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => shift(1)}
            disabled={month >= today.slice(0, 7)}
            aria-label="Next month"
            className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {written.length === 0
          ? 'No entries this month yet.'
          : `${written.length} ${written.length === 1 ? 'day' : 'days'} written${avg !== null ? ` · usually ${moodWord(avg)}` : ''}`}
      </p>

      <div className="mt-5 grid gap-8 md:grid-cols-[minmax(0,26rem)_1fr]">
        <div>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((w) => (
              <div key={w} className="pb-1 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
                {w.slice(0, 1)}
                <span className="hidden sm:inline">{w.slice(1)}</span>
              </div>
            ))}
            {cells.map((date, i) => {
              if (!date) return <div key={`lead-${i}`} />
              const has = byDate.has(date)
              const mood = dayMood(date)
              const future = date > today
              const day = Number(date.slice(8))
              return (
                <button
                  key={date}
                  type="button"
                  data-date={date}
                  disabled={!has}
                  onClick={() => setSelected((s) => (s === date ? null : date))}
                  title={has ? `${formatDay(date)} — ${moodWord(mood)}` : formatDay(date)}
                  aria-label={`${formatDay(date)}${has ? `, mood ${moodWord(mood)}` : ', no entry'}`}
                  aria-pressed={selected === date}
                  className={cn(
                    'relative aspect-square rounded-md text-[11px] transition-transform',
                    has ? 'hover:scale-105' : 'cursor-default border border-dashed border-border',
                    future && 'opacity-40',
                    selected === date && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                    date === today && !has && 'border-solid border-foreground/40',
                  )}
                  style={has ? { background: moodColor(mood) } : undefined}
                >
                  <span
                    className={cn(
                      'absolute left-1.5 top-1 tabular-nums',
                      has
                        ? mood !== null && mood < 2.5
                          ? 'text-white/90'
                          : 'text-foreground/70'
                        : 'text-muted-foreground/70',
                    )}
                  >
                    {day}
                  </span>
                </button>
              )
            })}
          </div>

          <div className="mt-3 flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
            <span>Low</span>
            {[1, 2, 3, 4, 5].map((m) => (
              <span key={m} className="h-3 w-3 rounded-sm" style={{ background: moodColor(m) }} />
            ))}
            <span>Good</span>
          </div>
        </div>

        {selected && selectedRows.length > 0 ? (
          <div data-testid="day-detail" className="h-fit space-y-3 rounded-xl border border-border bg-card p-4 md:mt-6">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium text-foreground">
                {formatDay(selected, {
                  weekday: 'long',
                  month: 'long',
                  day: 'numeric',
                })}
              </p>
              <Link
                to={`/journal#entry-${selected}`}
                className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
              >
                Open in journal
              </Link>
            </div>
            {selectedRows.map((r) => (
              <div key={r.recordId} className="flex items-start gap-3">
                <MoodDot mood={r.data.mood} className="mt-1.5" />
                <div className="space-y-1.5">
                  <p className="text-sm text-foreground">
                    {r.data.riskFlag ? 'A hard moment, kept private.' : (r.data.summary ?? r.data.text.slice(0, 120))}
                  </p>
                  {!r.data.riskFlag && r.data.moodTags && r.data.moodTags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {r.data.moodTags.map((t) => (
                        <Tag key={t}>{t}</Tag>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="hidden text-sm text-muted-foreground md:mt-6 md:block">
            {written.length ? 'Tap a colored day to see what you wrote.' : ''}
          </p>
        )}
      </div>
    </section>
  )
}
