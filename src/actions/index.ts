import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { DEMO_ENTRIES } from '../lib/demo'
import { addDays } from '../lib/patterns'
import {
  analyzeEntryText,
  type MemoryDay,
  anthropicBody,
  anthropicText,
  type Complete,
} from '../server/journal-ai'
import { buildInsight, type EntryRow } from '../server/insight'

/**
 * Every action here runs RBAC-off (see src/server/action-routes.ts), so each
 * one scopes reads and writes to the caller explicitly. Diaries are the most
 * private data an app can hold; never trust an id from params without
 * checking it belongs to `userId`.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const ALLOWED_RANGES = [7, 10, 14]
/** Insights cost a Sonnet call; this caps what one person can trigger per day. */
const MAX_MANUAL_INSIGHTS_PER_DAY = 6

export function completeVia(tools: ActionTools): Complete {
  return async (req) => {
    const r = await tools.integration('anthropic/chat-completion', anthropicBody(req))
    if (!r.success) throw new Error(r.error)
    return anthropicText(r.data)
  }
}

interface EntryData extends EntryRow {
  text: string
  moodEdited?: boolean | number
  isDemo?: boolean | number
  sharedWith?: string[]
}

async function ownEntries(tools: ActionTools, userId: string) {
  const r = await tools.query<EntryData & Record<string, unknown>>('entries', { where: { userId }, limit: 1000 })
  if (!r.success) throw new Error(r.error)
  return r.data.records
}

/** How far back Hearth's memory reaches when it reflects on a new entry. */
const MEMORY_DAYS = 21

/** The person's own recent, analyzed days before `date` — never crisis entries. */
async function memoryFor(tools: ActionTools, userId: string, date: string, excludeId: string): Promise<MemoryDay[]> {
  const from = addDays(date, -MEMORY_DAYS)
  return (await ownEntries(tools, userId))
    .filter(
      (r) =>
        r.recordId !== excludeId &&
        r.data.status === 'analyzed' &&
        !r.data.riskFlag &&
        r.data.entryDate >= from &&
        r.data.entryDate < date,
    )
    .sort((a, b) => a.data.entryDate.localeCompare(b.data.entryDate))
    .map((r) => ({ date: r.data.entryDate, mood: r.data.mood ?? null, summary: r.data.summary ?? '' }))
}

const analyzeEntry: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const entryId = typeof params.entryId === 'string' ? params.entryId : ''
  const got = await tools.get<EntryData & Record<string, unknown>>('entries', entryId)
  if (!got.success) return { success: false, error: 'Entry not found' }
  const entry = got.data.record
  if (entry.data.userId !== userId) return { success: false, error: 'Entry not found' }
  // Re-analysis only for entries that need it — stops a loop from burning credits.
  if (entry.data.status === 'analyzed' && params.force !== true) {
    return { success: true, data: { status: 'analyzed' } }
  }

  try {
    const a = await analyzeEntryText(completeVia(tools), entry.data.text, {
      today: entry.data.entryDate,
      days: await memoryFor(tools, userId, entry.data.entryDate, entryId),
    })
    // A mood the person set by hand wins over the model's reading.
    if (entry.data.moodEdited && typeof entry.data.mood === 'number') {
      a.mood = entry.data.mood
      a.signals.mood = entry.data.mood
    }
    const updated = await tools.update('entries', entryId, {
      status: 'analyzed',
      mood: a.mood,
      moodTags: a.moodTags,
      summary: a.summary,
      reflection: a.reflection,
      riskFlag: a.riskFlag,
      signals: a.signals,
      recalls: a.riskFlag ? [] : a.recalls,
      // A crisis entry is never shared, whatever the composer toggle said.
      ...(a.riskFlag ? { sharedWith: [] } : {}),
    })
    if (!updated.success) return updated
    return { success: true, data: { status: 'analyzed', riskFlag: a.riskFlag } }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[analyzeEntry] ${msg}`)
    await tools.update('entries', entryId, { status: 'failed' })
    return { success: false, error: 'Hearth could not read this entry just now. Your words are saved — try again.' }
  }
}

const generateInsight: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const end = typeof params.today === 'string' && DATE_RE.test(params.today) ? params.today : null
  const days = typeof params.days === 'number' && ALLOWED_RANGES.includes(params.days) ? params.days : null
  if (!end || !days) return { success: false, error: 'Invalid range' }

  const existing = await tools.query<{ userId: string; trigger: string }>('insights', {
    where: { userId, trigger: 'manual' },
    limit: 200,
  })
  if (existing.success) {
    const today = new Date().toISOString().slice(0, 10)
    const todays = existing.data.records.filter((r) => r.createdAt.slice(0, 10) === today).length
    if (todays >= MAX_MANUAL_INSIGHTS_PER_DAY) {
      return { success: false, error: 'That is a lot of looking back for one day. Try again tomorrow.' }
    }
  }

  try {
    const [rows, habits] = await Promise.all([
      ownEntries(tools, userId),
      tools.query<{ name: string; userId: string; active: boolean }>('habits', { where: { userId }, limit: 50 }),
    ])
    const built = await buildInsight(completeVia(tools), {
      userId,
      rows: rows.map((r) => r.data),
      habits: habits.success ? habits.data.records.filter((h) => h.data.active).map((h) => h.data.name) : [],
      end,
      days,
      trigger: 'manual',
    })
    if (!built.ok) return { success: false, error: built.error }
    const created = await tools.create('insights', built.data)
    if (!created.success) return created
    return { success: true, data: { insightId: created.data.recordId } }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error(`[generateInsight] ${msg}`)
    return { success: false, error: 'Hearth could not finish your look-back just now. Try again in a moment.' }
  }
}

/** Fill the caller's journal with the ten demo days ending yesterday. */
const seedDemo: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const today = typeof params.today === 'string' && DATE_RE.test(params.today) ? params.today : null
  if (!today) return { success: false, error: 'Invalid date' }

  const rows = await ownEntries(tools, userId)
  if (rows.some((r) => r.data.isDemo)) return { success: true, data: { created: 0 } }

  const first = addDays(today, -DEMO_ENTRIES.length)
  let created = 0
  for (const [i, e] of DEMO_ENTRIES.entries()) {
    const r = await tools.create('entries', {
      userId,
      text: e.text,
      entryDate: addDays(first, i),
      source: 'text',
      status: 'analyzed',
      mood: e.mood,
      moodTags: e.moodTags,
      summary: e.summary,
      reflection: e.reflection,
      signals: e.signals,
      riskFlag: false,
      isDemo: true,
      sharedWith: [],
    })
    if (r.success) created++
  }
  return { success: true, data: { created } }
}

const clearDemo: ActionHandler<Env> = async ({ userId, tools }) => {
  const rows = await ownEntries(tools, userId)
  const demo = rows.filter((r) => r.data.isDemo)
  for (const r of demo) await tools.remove('entries', r.recordId)
  return { success: true, data: { removed: demo.length } }
}

// ── Exchange diary ─────────────────────────────────────────────────────────

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000

interface FriendshipData extends Record<string, unknown> {
  members: string[]
}

async function friendshipsOf(tools: ActionTools, userId: string) {
  const r = await tools.query<FriendshipData>('friendships', { limit: 1000 })
  if (!r.success) throw new Error(r.error)
  return r.data.records.filter((f) => Array.isArray(f.data.members) && f.data.members.includes(userId))
}

const acceptInvite: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const code = typeof params.code === 'string' ? params.code.trim() : ''
  if (!/^[A-Za-z0-9]{8,32}$/.test(code)) return { success: false, error: 'That invite link is not valid.' }

  const found = await tools.query<{ code: string; userId: string; status: string }>('invites', { where: { code }, limit: 1 })
  const invite = found.success ? found.data.records[0] : undefined
  if (!invite || invite.data.status !== 'open' || Date.now() - Date.parse(invite.createdAt) > INVITE_TTL_MS) {
    return { success: false, error: 'This invite has expired or was already used. Ask for a new link.' }
  }
  const inviter = invite.data.userId
  if (inviter === userId) return { success: false, error: "That's your own invite. Send it to a friend." }

  const existing = await friendshipsOf(tools, userId)
  if (!existing.some((f) => f.data.members.includes(inviter))) {
    const created = await tools.create('friendships', { members: [inviter, userId] })
    if (!created.success) return created
  }
  await tools.update('invites', invite.recordId, { status: 'used' })
  return { success: true, data: { friendId: inviter } }
}

/** End a pairing, and take back everything each side had shared with the other. */
const unpair: ActionHandler<Env> = async ({ userId, params, tools }) => {
  const friendId = typeof params.friendId === 'string' ? params.friendId : ''
  const pairs = (await friendshipsOf(tools, userId)).filter((f) => f.data.members.includes(friendId))
  if (!pairs.length) return { success: false, error: 'Not paired with this person.' }

  for (const [owner, other] of [
    [userId, friendId],
    [friendId, userId],
  ]) {
    for (const e of await ownEntries(tools, owner)) {
      const shared = Array.isArray(e.data.sharedWith) ? e.data.sharedWith : []
      if (shared.includes(other)) await tools.update('entries', e.recordId, { sharedWith: shared.filter((id) => id !== other) })
    }
  }
  for (const f of pairs) await tools.remove('friendships', f.recordId)
  return { success: true, data: { unpaired: friendId } }
}

export const actions: Record<string, ActionHandler<Env>> = {
  analyzeEntry,
  generateInsight,
  seedDemo,
  clearDemo,
  acceptInvite,
  unpair,
}
