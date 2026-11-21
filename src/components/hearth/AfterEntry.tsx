/**
 * What Hearth offers right after an entry: a link to the past day it
 * remembered, today's habit check-in, and at most one "for tomorrow" nudge
 * drawn from the person's own patterns. Plus the never-miss-twice line shown
 * before writing. All computed from synced entries — no extra model calls.
 */

import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useMutations, useQuery } from 'deepspace'
import { Check, Flame, History, Sparkles } from 'lucide-react'
import { Button, useToast } from '@/components/ui'
import { formatDay } from '@/lib/client'
import { nudgeFor } from '@/lib/nudge'
import { addDays, findPatterns, habitProgress, toDays, type DayPoint } from '@/lib/patterns'
import { HABIT_SIGNALS, normalizeSignals, type HabitSignal } from '@/lib/signals'
import type { Entry, Habit } from '@/lib/types'

type Row = { recordId: string; createdAt: string; data: Entry }

/** Patterns for nudges look at the same two weeks as the look-back. */
const WINDOW = 14

function points(rows: Row[], from: string, to: string): DayPoint[] {
  // Oldest first: when a day has several entries, the latest explicit answer wins (mergeDay).
  return [...rows]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .filter(
      (r) => r.data.status === 'analyzed' && !r.data.riskFlag && r.data.entryDate >= from && r.data.entryDate <= to,
    )
    .map((r) => ({ date: r.data.entryDate, signals: normalizeSignals(r.data.signals) }))
}

function useActiveHabits() {
  const { records } = useQuery<Habit>('habits')
  return records.filter((h) => h.data.active && h.data.signal)
}

export function AfterEntry({ entry, rows }: { entry: Entry; rows: Row[] }) {
  const habits = useActiveHabits()
  const { createConfirmed, ready } = useMutations<Habit>('habits')
  const { success, error } = useToast()
  const date = entry.entryDate
  const from = addDays(date, -(WINDOW - 1))

  const { nudge, checkins } = useMemo(() => {
    const pts = points(rows, from, date)
    const today = toDays(pts.filter((p) => p.date === date))[0]?.signals
    const checkins = habits.map((h) => {
      const progress = habitProgress(h.data.signal as HabitSignal, pts, from, date)
      return { habit: h.data, done: progress.days.at(-1)?.done ?? null, streak: progress.streak }
    })
    // Patterns come from the days *before* this one, so "days like this" never counts today itself.
    const before = pts.filter((p) => p.date < date)
    return { nudge: today ? nudgeFor(today, findPatterns(before)) : null, checkins }
  }, [rows, from, date, habits])

  const recall = entry.recalls?.[0]
  const existing = nudge ? habits.find((h) => h.data.signal === nudge.habit.signal) : undefined
  const noticed = checkins.filter((c) => c.done !== null)

  const adopt = async () => {
    if (!nudge) return
    try {
      await createConfirmed({
        name: nudge.habit.name,
        identity: '',
        stack: nudge.habit.stack,
        twoMinute: nudge.habit.twoMinute,
        signal: nudge.habit.signal,
        active: true,
      })
      success('Hearth will keep an eye on it', `"${nudge.habit.name}" fills in from your entries.`)
    } catch (e) {
      error('Could not add the habit', e instanceof Error ? e.message : undefined)
    }
  }

  if (!recall && !nudge && noticed.length === 0) return null

  return (
    <div className="mt-6 space-y-4" data-testid="after-entry">
      {recall && (
        <Link
          to={`/insights?day=${recall}`}
          data-testid="recall-link"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
        >
          <History className="h-3.5 w-3.5" aria-hidden /> Remembering{' '}
          {formatDay(recall, { weekday: 'long', month: 'short', day: 'numeric' })}
        </Link>
      )}

      {noticed.length > 0 && (
        <ul data-testid="habit-checkins" className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          {noticed.map(({ habit, done, streak }) => (
            <li key={habit.name} className={done ? 'text-foreground' : 'text-muted-foreground'}>
              {done ? (
                <Check className="mr-1 inline h-4 w-4 text-primary" aria-hidden />
              ) : (
                <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-border align-middle" />
              )}
              {habit.name}
              {done && streak >= 2 && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-primary">
                  <Flame className="h-3 w-3" aria-hidden /> {streak} days
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {nudge && (
        <section
          data-testid="nudge"
          data-pattern-id={nudge.patternId}
          className="rounded-xl border border-border bg-card p-5"
        >
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">For tomorrow</p>
          <p className="mt-2 text-[15px] leading-relaxed text-foreground">{nudge.observation}</p>
          {existing ? (
            <p className="mt-2 text-[15px] leading-relaxed text-foreground">
              This is what “{existing.data.name}” is for. Tomorrow, just the two-minute version:{' '}
              <span className="text-muted-foreground">{existing.data.twoMinute || nudge.habit.twoMinute}</span>
            </p>
          ) : (
            <>
              <p className="mt-2 text-[15px] leading-relaxed text-foreground">{nudge.tip}</p>
              <Button
                size="sm"
                className="mt-4 rounded-full"
                onClick={() => void adopt()}
                disabled={!ready}
                data-testid="adopt-nudge"
              >
                <Sparkles className="h-4 w-4" aria-hidden /> Yes, help me keep this
              </Button>
            </>
          )}
          <p className="mt-3 text-xs text-muted-foreground">
            Based on{' '}
            {nudge.evidence.map((d, i) => (
              <span key={d}>
                {i > 0 && ', '}
                <Link
                  to={`/insights?day=${d}`}
                  className="underline decoration-border underline-offset-2 hover:text-foreground"
                >
                  {formatDay(d, { month: 'short', day: 'numeric' })}
                </Link>
              </span>
            ))}
          </p>
        </section>
      )}
    </div>
  )
}

/** Before writing: if a habit slipped on the last day Hearth heard about, don't let it become two. */
export function NeverMissTwice({ rows, today }: { rows: Row[]; today: string }) {
  const habits = useActiveHabits()
  const line = useMemo(() => {
    const from = addDays(today, -(WINDOW - 1))
    const pts = points(rows, from, addDays(today, -1))
    for (const h of habits) {
      const p = habitProgress(h.data.signal as HabitSignal, pts, from, addDays(today, -1))
      if (p.missedOnce && p.days.at(-1)?.done === false) {
        const what = HABIT_SIGNALS[h.data.signal as HabitSignal].label.toLowerCase()
        return `Yesterday slipped on ${what}. One miss is an accident; today, just the two-minute version${h.data.twoMinute ? `: ${h.data.twoMinute.replace(/\.$/, '')}` : ''}.`
      }
    }
    return null
  }, [rows, today, habits])
  if (!line) return null
  return (
    <p data-testid="never-miss-twice" className="mt-4 border-l-2 border-primary/60 pl-3 text-sm text-muted-foreground">
      {line}
    </p>
  )
}
