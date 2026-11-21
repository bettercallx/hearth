import { appFiles } from 'deepspace/worker'
import type { ActionHandler, ActionTools } from 'deepspace/worker'
import type { Env } from '../../worker'
import { DEMO_ENTRIES, DEMO_FRIEND_ENTRIES, DEMO_REPLIES } from '../lib/demo'
import { DEMO_FRIEND, isDemoUser } from '../lib/demo-friend'
import { createActionTools } from '../server/action-routes'
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

function completeVia(tools: ActionTools): Complete {
  return async (req) => {
    const r = await tools.integration('anthropic/chat-completion', anthropicBody(req))
    if (!r.success) throw new Error(r.error)
    return anthropicText(r.data)
  }
}

interface EntryData extends EntryRow {
  text: string
  photo?: { key: string } | null
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
        r.data.source !== 'exchange' &&
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
  // Exchange-diary pages belong to the notebook; Hearth doesn't read them as journal entries.
  if (entry.data.source === 'exchange') return { success: true, data: { status: 'skipped' } }
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

/**
 * Two weeks of sample data ending yesterday: the caller's journal, plus an
 * exchange diary with the sample friend (her pages and replies both ways).
 * Loading again replaces the old sample, so it also upgrades older demos.
 */
const seedDemo: ActionHandler<Env> = async (ctx) => {
  const { userId, params, tools, env, callerJwt } = ctx
  const today = typeof params.today === 'string' && DATE_RE.test(params.today) ? params.today : null
  if (!today) return { success: false, error: 'Invalid date' }

  await removeDemo(tools, userId)

  const first = addDays(today, -DEMO_ENTRIES.length)
  const friend = DEMO_FRIEND.id
  // Writes as the sample friend: her id is stamped on her rows like any author's.
  const asFriend = createActionTools(env, friend, callerJwt)

  const mine: string[] = []
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
      sharedWith: e.shared ? [friend] : [],
    })
    mine.push(r.success ? r.data.recordId : '')
  }

  const theirs: string[] = []
  for (const e of DEMO_FRIEND_ENTRIES) {
    const r = await asFriend.create('entries', {
      userId: friend,
      text: e.text,
      entryDate: addDays(first, e.day),
      source: 'text',
      status: 'analyzed',
      mood: e.mood,
      moodTags: e.moodTags,
      isDemo: true,
      sharedWith: [userId],
    })
    theirs.push(r.success ? r.data.recordId : '')
  }

  await tools.create('friendships', { members: [userId, friend] })

  for (const reply of DEMO_REPLIES) {
    const entryId = 'mine' in reply.on ? mine[reply.on.mine] : theirs[reply.on.friend]
    if (!entryId) continue
    const author = reply.from === 'me' ? tools : asFriend
    await author.create('replies', {
      userId: reply.from === 'me' ? userId : friend,
      entryId,
      text: reply.text ?? '',
      emoji: reply.emoji ?? '',
      participants: [userId, friend],
    })
  }

  return { success: true, data: { created: mine.filter(Boolean).length + theirs.filter(Boolean).length } }
}

/** Everything the sample put in this person's account, and nothing else. */
async function removeDemo(tools: ActionTools, userId: string) {
  const friend = DEMO_FRIEND.id
  const mineDemo = (await ownEntries(tools, userId)).filter((r) => r.data.isDemo)
  const theirs = (await ownEntries(tools, friend)).filter(
    (r) => r.data.isDemo && Array.isArray(r.data.sharedWith) && r.data.sharedWith.includes(userId),
  )
  const entryIds = new Set([...mineDemo, ...theirs].map((r) => r.recordId))

  const replies = await tools.query<{ entryId: string; participants: string[] }>('replies', { limit: 2000 })
  if (replies.success) {
    for (const r of replies.data.records) {
      const between = Array.isArray(r.data.participants) && r.data.participants.includes(userId) && r.data.participants.includes(friend)
      if (entryIds.has(r.data.entryId) || between) await tools.remove('replies', r.recordId)
    }
  }
  for (const id of entryIds) await tools.remove('entries', id)
  for (const f of await friendshipsOf(tools, userId)) {
    if (f.data.members.includes(friend)) await tools.remove('friendships', f.recordId)
  }
  return entryIds.size
}

const clearDemo: ActionHandler<Env> = async ({ userId, tools }) => {
  return { success: true, data: { removed: await removeDemo(tools, userId) } }
}

// ── Exchange diary ─────────────────────────────────────────────────────────

/** Delete a notebook page with its replies and its photo file. */
async function removeNotebookPage(tools: ActionTools, env: Env, owner: string, entryId: string, photo: unknown) {
  for (;;) {
    const r = await tools.deleteWhere('replies', { entryId }, 500)
    if (!r.success || r.data.deleted < 500) break
  }
  const key = (photo as { key?: string } | null | undefined)?.key
  if (key && !isDemoUser(owner)) {
    await appFiles(env, { scope: 'self', userId: owner })
      .delete(key)
      .catch((err: unknown) => console.error(`[unpair] photo delete failed: ${err instanceof Error ? err.message : String(err)}`))
  }
  await tools.remove('entries', entryId)
}

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

/**
 * End a pairing. Journal entries either side had shared become private again;
 * pages written in the notebook itself (source 'exchange') go with it, along
 * with their photos and replies, since they live nowhere else.
 */
const unpair: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const friendId = typeof params.friendId === 'string' ? params.friendId : ''
  const pairs = (await friendshipsOf(tools, userId)).filter((f) => f.data.members.includes(friendId))
  if (!pairs.length) return { success: false, error: 'Not paired with this person.' }

  for (const [owner, other] of [
    [userId, friendId],
    [friendId, userId],
  ]) {
    for (const e of await ownEntries(tools, owner)) {
      const shared = Array.isArray(e.data.sharedWith) ? e.data.sharedWith : []
      if (!shared.includes(other)) continue
      const rest = shared.filter((id) => id !== other)
      if (e.data.source === 'exchange' && rest.length === 0) {
        await removeNotebookPage(tools, env, owner, e.recordId, e.data.photo)
      } else {
        await tools.update('entries', e.recordId, { sharedWith: rest })
      }
    }
  }
  for (const f of pairs) await tools.remove('friendships', f.recordId)
  return { success: true, data: { unpaired: friendId } }
}

/** Tear a page you wrote out of the notebook, with its photo and replies. */
const tearOut: ActionHandler<Env> = async ({ userId, params, tools, env }) => {
  const entryId = typeof params.entryId === 'string' ? params.entryId : ''
  const got = await tools.get<EntryData & Record<string, unknown>>('entries', entryId)
  if (!got.success || got.data.record.data.userId !== userId || got.data.record.data.source !== 'exchange') {
    return { success: false, error: 'Page not found' }
  }
  await removeNotebookPage(tools, env, userId, entryId, got.data.record.data.photo)
  return { success: true, data: { removed: entryId } }
}

export const actions: Record<string, ActionHandler<Env>> = {
  analyzeEntry,
  generateInsight,
  seedDemo,
  clearDemo,
  acceptInvite,
  unpair,
  tearOut,
}
