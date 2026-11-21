/**
 * A month of days, each square colored by that day's mood — the journal at a
 * glance, like a contribution graph. Days without an entry stay empty. The
 * page owns the month and the selected day so other views can link to a day.
 */

import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDay, localToday } from '@/lib/client'
import type { Entry } from '@/lib/types'
import { cn } from '@/lib/utils'
import { moodColor, moodWord } from './bits'

type Row = { recordId: string; data: Entry }

/** Hearth launched in November 2026; there is nothing to page back to before it. */
export const FIRST_MONTH = '2026-11'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const pad = (n: number) => String(n).padStart(2, '0')

function shiftMonth(month: string, delta: number) {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`
}

/** Average mood for a day, ignoring crisis-flagged entries. */
export function dayMood(rows: Row[] | undefined) {
  const rated = (rows ?? []).filter((r) => typeof r.data.mood === 'number' && !r.data.riskFlag)
  return rated.length ? rated.reduce((a, r) => a + (r.data.mood as number), 0) / rated.length : null
}

export function MonthCalendar({
  byDate,
  month,
  onMonthChange,
  selected,
  onSelect,
}: {
  byDate: Map<string, Row[]>
  month: string
  onMonthChange: (month: string) => void
  selected: string | null
  onSelect: (date: string) => void
}) {
  const today = localToday()
  const [y, mo] = month.split('-').map(Number)
  const daysInMonth = new Date(y, mo, 0).getDate()
  // Monday-first: how many blank cells before the 1st.
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7
  const cells: (string | null)[] = [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${month}-${pad(i + 1)}`),
  ]

  const written = cells.filter((d): d is string => !!d && byDate.has(d))
  const moods = written.map((d) => dayMood(byDate.get(d))).filter((m): m is number => m !== null)
  const avg = moods.length ? moods.reduce((a, b) => a + b, 0) / moods.length : null

  return (
    <section data-testid="month-calendar" className="w-full max-w-[26rem]">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-2xl font-light text-foreground">
          {new Date(y, mo - 1, 1).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}
        </h2>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, -1))}
            disabled={month <= FIRST_MONTH}
            aria-label="Previous month"
            className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onMonthChange(shiftMonth(month, 1))}
            disabled={month >= today.slice(0, 7)}
            aria-label="Next month"
            className="rounded-full p-2 text-muted-foreground hover:bg-accent hover:text-foreground disabled:pointer-events-none disabled:opacity-30"
          >
            <ChevronRight className="h-4 w-4" aria-hidden />
          </button>
        </div>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        {written.length === 0
          ? 'No entries this month yet.'
          : `${written.length} ${written.length === 1 ? 'day' : 'days'} written${avg !== null ? ` · mostly ${moodWord(avg)}` : ''}`}
      </p>

      <div className="mt-5 grid grid-cols-7 gap-1.5">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-1 text-center text-[11px] uppercase tracking-wider text-muted-foreground">
            {w.slice(0, 1)}
            <span className="hidden sm:inline">{w.slice(1)}</span>
          </div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={`lead-${i}`} />
          const has = byDate.has(date)
          const mood = dayMood(byDate.get(date))
          const day = Number(date.slice(8))
          return (
            <button
              key={date}
              type="button"
              data-date={date}
              disabled={!has}
              onClick={() => onSelect(date)}
              title={has ? `${formatDay(date)} — ${moodWord(mood)}` : formatDay(date)}
              aria-label={`${formatDay(date)}${has ? `, mood ${moodWord(mood)}` : ', no entry'}`}
              aria-pressed={selected === date}
              className={cn(
                'relative aspect-square rounded-md text-[11px] transition-transform',
                has ? 'hover:scale-105' : 'cursor-default border border-dashed border-border',
                date > today && 'opacity-40',
                selected === date && 'ring-2 ring-foreground ring-offset-2 ring-offset-background',
                date === today && !has && 'border-solid border-foreground/40',
              )}
              style={has ? { background: moodColor(mood) } : undefined}
            >
              <span
                className={cn(
                  'absolute left-1.5 top-1 tabular-nums',
                  // Every mood colour is light, so numbers stay in ink.
                  has ? 'text-foreground/75' : 'text-muted-foreground/70',
                )}
              >
                {day}
              </span>
            </button>
          )
        })}
      </div>

      {/* Every step named: colour is never the only way to read a day. */}
      <div className="mt-3 flex items-start justify-end gap-2.5 text-[11px] text-muted-foreground" aria-label="Mood colours">
        {[1, 2, 3, 4, 5].map((m) => (
          <span key={m} className="flex flex-col items-center gap-1">
            <span className="h-3 w-5 rounded-sm" style={{ background: moodColor(m) }} />
            {moodWord(m)}
          </span>
        ))}
      </div>
    </section>
  )
}
