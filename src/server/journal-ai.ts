/**
 * Prompts and model calls for Hearth. Transport-agnostic: callers pass a
 * `complete` function, so the same code runs from a server action
 * (`tools.integration`) and from cron (`ctx.integrations.call`).
 */

import { HABIT_SIGNALS, POSITIVES, STRESSORS, normalizeSignals, type DaySignals } from '../lib/signals'
import type { Pattern, RangeStats } from '../lib/patterns'

const ENTRY_MODEL = 'claude-haiku-5-5'
const INSIGHT_MODEL = 'claude-sonnet-5-5'

export interface CompletionRequest {
  model: string
  system: string
  user: string
  maxTokens: number
}

/** Returns the model's text, or throws with a message safe to log. */
export type Complete = (req: CompletionRequest) => Promise<string>

/** Body for the `anthropic/chat-completion` integration. */
export function anthropicBody(req: CompletionRequest) {
  return {
    model: req.model,
    max_tokens: req.maxTokens,
    system: req.system,
    messages: [{ role: 'user', content: req.user }],
  }
}

/** Pull the text out of an Anthropic Messages response. */
export function anthropicText(data: unknown): string {
  const d = data as { content?: { type: string; text?: string }[]; stop_reason?: string } | null
  // Thinking tokens count toward max_tokens; a cut-off reply is half a JSON object.
  if (d?.stop_reason === 'max_tokens') throw new Error('Model reply was truncated (max_tokens)')
  const content = d?.content
  const text = content?.find((c) => c.type === 'text')?.text
  if (!text) throw new Error('Model returned no text')
  return text
}

/** Models sometimes wrap JSON in prose or fences; take the outermost object. */
export function parseJsonObject(text: string): Record<string, unknown> {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('Model did not return JSON')
  return JSON.parse(text.slice(start, end + 1)) as Record<string, unknown>
}

/** One retry when the reply isn't parseable JSON — models occasionally answer in prose. */
async function completeJson(complete: Complete, req: CompletionRequest): Promise<Record<string, unknown>> {
  try {
    return parseJsonObject(await complete(req))
  } catch {
    return parseJsonObject(
      await complete({ ...req, user: `${req.user}\n\nYour previous reply was not valid JSON. Reply with only the JSON object described.` }),
    )
  }
}

// ── Safety ────────────────────────────────────────────────────────────────

/**
 * A deterministic backstop for the model's own risk flag: if either fires,
 * the entry gets crisis resources instead of analysis. Over-triggering here
 * costs a gentle message; under-triggering could cost much more.
 */
const RISK_PATTERNS = [
  /\b(kill(ing)? myself|suicid(e|al)|end(ing)? (it all|my life)|want(ed)? to die|better off dead|self[- ]?harm|hurt(ing)? myself|cut(ting)? myself)\b/i,
  /(不想活|自杀|轻生|想死|伤害自己|结束生命|割腕)/,
]

export function matchesRiskLanguage(text: string): boolean {
  return RISK_PATTERNS.some((re) => re.test(text))
}

// ── Per-entry analysis ────────────────────────────────────────────────────

interface EntryAnalysis {
  mood: number | null
  moodTags: string[]
  summary: string
  reflection: string
  riskFlag: boolean
  signals: DaySignals
  /** Past days the reflection refers back to — always dates from the context given. */
  recalls: string[]
}

/** A past day offered to the model as memory: only what the person already wrote. */
export interface MemoryDay {
  date: string
  mood: number | null
  summary: string
}

const ENTRY_SYSTEM = `You are Hearth, a warm, unhurried journaling companion. Someone has just shared a journal entry with you. You do two jobs at once:

1. LISTEN. Write a short "reflection" (1–3 sentences) the way a caring friend who is a good listener would: name what they seem to feel, reflect back something specific they said, and leave room. Do not give advice, do not diagnose, do not use therapy jargon, do not be saccharine or use exclamation marks. Write in the same language as the entry.

2. NOTICE. Extract structured signals so patterns can be found later. Only record what the entry states or clearly implies — use null when it is not mentioned. Never guess sleep hours or lunch timing.

3. REMEMBER. You may be given the person's RECENT DAYS. If, and only if, one of them is genuinely similar to today (the same situation or stressor, or something that helped then and could help now), refer to it once, naturally, inside the reflection ("a lot like last Wednesday, when…", "on Nov 11 a walk helped"), and put its date in "recalls". Use only what that day's summary says; never invent details. If nothing is clearly similar, leave "recalls" empty and don't mention the past. Never refer to days not in the list.

Safety: if the entry expresses thoughts of suicide, self-harm, or harming others, set "riskFlag": true and make the reflection gently acknowledge their pain and encourage reaching out to someone they trust or a crisis line. Otherwise false.

Respond with ONLY a JSON object of this exact shape:
{
  "mood": 1-5 (1 very low, 3 neutral, 5 very good),
  "moodTags": [1–3 short lowercase feeling words, same language as the entry],
  "summary": "one sentence, under 20 words, third-person-free (e.g. 'Skipped lunch for meetings; foggy afternoon.')",
  "reflection": "...",
  "riskFlag": false,
  "recalls": [] or ["YYYY-MM-DD"] (at most one date, from RECENT DAYS),
  "signals": {
    "energyMorning": 1-5 | null,
    "energyAfternoon": 1-5 | null,
    "energyEvening": 1-5 | null,
    "sleepHours": number | null,
    "lunch": "on_time" | "late" | "skipped" | null,
    "exercise": true | false | null,
    "outdoors": true | false | null,
    "social": true | false | null   (a meaningful interaction with someone, not just being around people),
    "lateScreen": true | false | null  (on phone/screens late at night or in bed),
    "stressors": [zero or more of: ${Object.keys(STRESSORS).join(', ')}],
    "positives": [zero or more of: ${Object.keys(POSITIVES).join(', ')}],
    "activities": [up to 6 short phrases of what they did, same language as the entry]
  }
}
"on_time" lunch means roughly 11:30–13:30; "late" is after about 14:00.`

const weekday = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' })

export async function analyzeEntryText(
  complete: Complete,
  text: string,
  memory: { today: string; days: MemoryDay[] } = { today: '', days: [] },
): Promise<EntryAnalysis> {
  const recent = memory.days
    .filter((d) => d.summary)
    .map((d) => `- ${d.date} (${weekday(d.date)}): mood ${d.mood ?? '?'}/5. ${d.summary}`)
    .join('\n')
  const user =
    (recent
      ? `TODAY (${memory.today}, ${weekday(memory.today)}):\n${text.slice(0, 8000)}\n\nRECENT DAYS (memory; refer back only if genuinely similar):\n${recent}`
      : `TODAY:\n${text.slice(0, 8000)}`) + '\n\nRespond with the JSON object only.'
  // The models think before answering (often 600–950 tokens here), and thinking
  // counts toward max_tokens: leave plenty of room so the JSON is never cut off.
  // Billing follows tokens actually used, not this ceiling.
  const json = await completeJson(complete, { model: ENTRY_MODEL, system: ENTRY_SYSTEM, user, maxTokens: 4000 })
  const signals = normalizeSignals({ ...(json.signals as object), mood: json.mood })
  const moodTags = Array.isArray(json.moodTags)
    ? json.moodTags.filter((t): t is string => typeof t === 'string').slice(0, 3)
    : []
  return {
    mood: signals.mood,
    moodTags,
    summary: typeof json.summary === 'string' ? json.summary.slice(0, 240) : '',
    reflection: typeof json.reflection === 'string' ? json.reflection.slice(0, 600) : '',
    riskFlag: json.riskFlag === true || matchesRiskLanguage(text),
    signals,
    // Only dates we actually offered survive — a model can't "remember" a day that isn't there.
    recalls: Array.isArray(json.recalls)
      ? json.recalls.filter((d): d is string => typeof d === 'string' && memory.days.some((m) => m.date === d)).slice(0, 1)
      : [],
  }
}

// ── Insight over a range ──────────────────────────────────────────────────

const LAWS = ['obvious', 'attractive', 'easy', 'satisfying'] as const
export type Law = (typeof LAWS)[number]

export interface Suggestion {
  title: string
  law: Law
  patternId: string | null
  why: string
  stack: string
  twoMinute: string
  signal: keyof typeof HABIT_SIGNALS | null
}

interface InsightContent {
  narrative: string
  identity: string
  highlights: { date: string; text: string }[]
  patterns: (Pattern & { note?: string })[]
  suggestions: Suggestion[]
}

interface InsightInputDay {
  date: string
  mood: number | null
  summary: string
  activities: string[]
  riskFlag: boolean
}

const INSIGHT_SYSTEM = `You are Hearth, a warm journaling companion writing someone's personal look-back over their recent days. You are given:
- their day-by-day summaries,
- statistics computed by code,
- PATTERNS computed by code, each with an id, a statement containing the real numbers, a confidence level and the evidence dates.

Rules:
- Never invent numbers or patterns. Only reference the provided patterns by id. If there are none, say there is not enough yet and encourage them to keep writing.
- Patterns are correlations from a handful of days, not causes. Hedge accordingly ("it looks like", "might"), more for "tentative" ones.
- The narrative is a short LETTER from you, Hearth, to them: first person ("This week I noticed…", "I keep thinking about Thursday…"), addressed to "you", plain warm language, specific to their actual days. No greeting or sign-off; those are added for you. No therapy jargon, no exclamation marks, no toxic positivity.
- Never quote or describe days marked "hard day (private)" beyond acknowledging the week had very hard moments.

Suggestions follow James Clear's "Atomic Habits":
- Each suggestion targets ONE provided pattern (patternId) and uses ONE of the four laws of behavior change: "obvious" (make the cue visible: implementation intentions, environment design), "attractive" (temptation bundling, join a culture), "easy" (reduce friction, the two-minute rule), "satisfying" (immediate reward, habit tracking, never miss twice).
- "stack" is a habit-stacking sentence: "After I [an existing routine from their entries], I will [new habit]."
- "twoMinute" is the version that takes under two minutes.
- "signal" links the suggestion to a trackable habit signal if one fits, else null. Allowed: ${Object.keys(HABIT_SIGNALS).join(', ')}.
- At most 3 suggestions, the most impactful first. Make them small and kind, never a lecture.

The "identity" line is evidence-based identity reinforcement in the style of Atomic Habits: "This week you were someone who …" — pick something true and good from the data, even in a hard week.

Respond with ONLY JSON:
{
  "narrative": "the letter: 2 short paragraphs separated by \\n\\n, first what you saw them do, then how their days felt and how that moved",
  "highlights": [{"date": "YYYY-MM-DD", "text": "a moment worth remembering, <15 words"}] (2–4 items),
  "identity": "...",
  "patternNotes": [{"id": "<pattern id>", "note": "one gentle sentence on what this might mean for them"}],
  "suggestions": [{"title": "...", "law": "obvious|attractive|easy|satisfying", "patternId": "<id>", "why": "one sentence tying it to the pattern", "stack": "After I …, I will …", "twoMinute": "...", "signal": "<signal or null>"}]
}
Write in the language most of the summaries are written in.`

export async function writeInsight(
  complete: Complete,
  input: { days: InsightInputDay[]; stats: RangeStats; patterns: Pattern[]; habits: string[] },
): Promise<InsightContent> {
  const payload = {
    days: input.days.map((d) =>
      d.riskFlag
        ? { date: d.date, note: 'hard day (private)' }
        : { date: d.date, mood: d.mood, summary: d.summary, activities: d.activities },
    ),
    stats: { ...input.stats, series: undefined },
    patterns: input.patterns.map(({ id, statement, confidence, evidence }) => ({ id, statement, confidence, evidence })),
    existingHabits: input.habits,
  }
  const json = await completeJson(complete, {
    model: INSIGHT_MODEL,
    system: INSIGHT_SYSTEM,
    user: JSON.stringify(payload),
    maxTokens: 8000,
  })
  const ids = new Set(input.patterns.map((p) => p.id))
  const dates = new Set(input.days.filter((d) => !d.riskFlag).map((d) => d.date))

  const notes = new Map<string, string>()
  if (Array.isArray(json.patternNotes)) {
    for (const n of json.patternNotes as { id?: unknown; note?: unknown }[]) {
      if (typeof n.id === 'string' && typeof n.note === 'string' && ids.has(n.id)) notes.set(n.id, n.note)
    }
  }

  const suggestions: Suggestion[] = Array.isArray(json.suggestions)
    ? (json.suggestions as Record<string, unknown>[])
        .filter((s) => typeof s.title === 'string' && LAWS.includes(s.law as Law))
        .slice(0, 3)
        .map((s) => ({
          title: String(s.title),
          law: s.law as Law,
          // A suggestion pointing at a pattern we never computed is untethered; drop the link.
          patternId: typeof s.patternId === 'string' && ids.has(s.patternId) ? s.patternId : null,
          why: typeof s.why === 'string' ? s.why : '',
          stack: typeof s.stack === 'string' ? s.stack : '',
          twoMinute: typeof s.twoMinute === 'string' ? s.twoMinute : '',
          signal: typeof s.signal === 'string' && s.signal in HABIT_SIGNALS ? (s.signal as Suggestion['signal']) : null,
        }))
    : []

  return {
    narrative: typeof json.narrative === 'string' ? json.narrative : '',
    identity: typeof json.identity === 'string' ? json.identity : '',
    highlights: Array.isArray(json.highlights)
      ? (json.highlights as { date?: unknown; text?: unknown }[])
          .filter((h) => typeof h.date === 'string' && dates.has(h.date) && typeof h.text === 'string')
          .slice(0, 4)
          .map((h) => ({ date: h.date as string, text: h.text as string }))
      : [],
    patterns: input.patterns.map((p) => ({ ...p, note: notes.get(p.id) })),
    suggestions,
  }
}
