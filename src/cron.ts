/**
 * Cron task definitions — registered into the AppCronRoom DO at construction
 * time (worker.ts). The DO alarm fires `runTask(name, env)` on the schedule
 * declared here; the DO itself records executions, tracks history, and
 * pushes status to admin clients via the `/ws/cron/:roomId` WebSocket.
 *
 * `weekly-insights` writes every active journaler a Sunday-evening look-back
 * over their last seven days, so the reflection arrives without asking.
 */

import type { CronTask } from 'deepspace/worker'
import { buildCronContext } from 'deepspace/worker'
import type { Env } from '../worker'
import { anthropicBody, anthropicText, type Complete } from './server/journal-ai'
import { buildInsight, MIN_DAYS_FOR_INSIGHT, type EntryRow } from './server/insight'
import { addDays } from './lib/patterns'
import { isDemoUser } from './lib/demo-friend'

const TIMEZONE = 'America/New_York'

export const tasks: CronTask[] = [{ name: 'weekly-insights', schedule: '0 19 * * 0', timezone: TIMEZONE }]

interface Envelope<T> {
  recordId: string
  data: T
}

/** Today's calendar date in the schedule's timezone, as YYYY-MM-DD. */
function todayIn(timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
}

export async function runTask(name: string, env: Env): Promise<void> {
  if (name !== 'weekly-insights') return
  const ctx = buildCronContext(env, env.OWNER_USER_ID, `app:${env.DEEPSPACE_APP_ID}`)
  const complete: Complete = async (req) =>
    anthropicText(await ctx.integrations.call('anthropic/chat-completion', anthropicBody(req)))

  const end = todayIn(TIMEZONE)
  const start = addDays(end, -6)
  const entries = (await ctx.records.query('entries', { where: { status: 'analyzed' }, limit: 5000 })) as Envelope<EntryRow>[]
  const insights = (await ctx.records.query('insights', { where: { rangeEnd: end, trigger: 'weekly' }, limit: 1000 })) as Envelope<{ userId: string }>[]
  const done = new Set(insights.map((i) => i.data.userId))

  // Group this week's rows by person; skip anyone already done (a re-run is idempotent).
  const byUser = new Map<string, EntryRow[]>()
  for (const e of entries) {
    // The sample friend is not a person: never spend a letter on her.
    if (
      e.data.entryDate < start ||
      e.data.entryDate > end ||
      done.has(e.data.userId) ||
      isDemoUser(e.data.userId) ||
      e.data.source === 'exchange'
    )
      continue
    byUser.set(e.data.userId, [...(byUser.get(e.data.userId) ?? []), e.data])
  }

  let written = 0
  let failed = 0
  for (const [userId, rows] of byUser) {
    if (new Set(rows.map((r) => r.entryDate)).size < MIN_DAYS_FOR_INSIGHT) continue
    try {
      const habits = (await ctx.records.query('habits', { where: { userId }, limit: 50 })) as Envelope<{ name: string; active: boolean }>[]
      const built = await buildInsight(complete, {
        userId,
        rows,
        habits: habits.filter((h) => h.data.active).map((h) => h.data.name),
        end,
        days: 7,
        trigger: 'weekly',
      })
      if (built.ok) {
        await ctx.records.create('insights', built.data)
        written++
      }
    } catch (err) {
      failed++
      console.error(`[weekly-insights] user=${userId} ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  console.info(`[weekly-insights] ${end}: wrote ${written}, failed ${failed}, users ${byUser.size}`)
  // One person's failure shouldn't hide the others, but a total failure should show in cron history.
  if (failed > 0 && written === 0) throw new Error(`weekly-insights: all ${failed} insight(s) failed`)
}
