/**
 * Builds one insight record for one person over [end - days + 1, end].
 * Shared by the on-demand server action and the weekly cron task, which read
 * records through different APIs — both hand in plain rows.
 */

import { addDays, computeStats, findPatterns, type DayPoint } from '../lib/patterns'
import { normalizeSignals } from '../lib/signals'
import { writeInsight, type Complete } from './journal-ai'

export interface EntryRow {
  userId: string
  entryDate: string
  source?: string
  status?: string
  mood?: number | null
  summary?: string
  signals?: unknown
  riskFlag?: boolean | number
}

export const MIN_DAYS_FOR_INSIGHT = 3

type InsightBuild =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; error: string }

export async function buildInsight(
  complete: Complete,
  args: { userId: string; rows: EntryRow[]; habits: string[]; end: string; days: number; trigger: 'manual' | 'weekly' },
): Promise<InsightBuild> {
  const start = addDays(args.end, -(args.days - 1))
  const rows = args.rows.filter(
    (r) =>
      r.userId === args.userId &&
      r.status === 'analyzed' &&
      r.source !== 'exchange' &&
      r.entryDate >= start &&
      r.entryDate <= args.end,
  )
  const points: DayPoint[] = rows.map((r) => ({ date: r.entryDate, signals: normalizeSignals(r.signals) }))
  const stats = computeStats(points)
  if (stats.daysLogged < MIN_DAYS_FOR_INSIGHT) {
    return {
      ok: false,
      error: `Hearth needs at least ${MIN_DAYS_FOR_INSIGHT} days of entries in this range to look back on — you have ${stats.daysLogged}.`,
    }
  }
  const patterns = findPatterns(points)

  // One line per day for the model: the latest summary, merged activities.
  const byDate = new Map<string, EntryRow[]>()
  for (const r of rows) byDate.set(r.entryDate, [...(byDate.get(r.entryDate) ?? []), r])
  const days = [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({
      date,
      mood: stats.series.find((s) => s.date === date)?.mood ?? null,
      summary: list.map((r) => r.summary ?? '').filter(Boolean).join(' / '),
      activities: [...new Set(list.flatMap((r) => normalizeSignals(r.signals).activities))],
      riskFlag: list.some((r) => Boolean(r.riskFlag)),
    }))

  const content = await writeInsight(complete, { days, stats, patterns, habits: args.habits })
  return {
    ok: true,
    data: {
      userId: args.userId,
      rangeStart: start,
      rangeEnd: args.end,
      days: args.days,
      trigger: args.trigger,
      narrative: content.narrative,
      identity: content.identity,
      highlights: content.highlights,
      patterns: content.patterns,
      suggestions: content.suggestions,
      stats,
    },
  }
}
