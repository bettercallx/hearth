/**
 * Pattern finder over a person's recent days.
 *
 * Deliberately not machine learning: ten journal days is ten data points, far
 * too few to train anything honest. Instead this does transparent
 * with/without comparisons and tag co-occurrence, keeps every finding tied to
 * the exact days that support it, and refuses to speak below a minimum sample.
 * The AI later turns these into words — it never invents the numbers.
 */

import {
  HABIT_SIGNALS,
  POSITIVES,
  STRESSORS,
  mergeDay,
  type DaySignals,
  type HabitSignal,
  type PositiveTag,
  type StressorTag,
} from './signals'

export interface DayPoint {
  date: string // YYYY-MM-DD
  signals: DaySignals
}

export type Confidence = 'tentative' | 'emerging' | 'consistent'

export interface Pattern {
  id: string
  kind: 'association' | 'trigger' | 'lift'
  /** Plain-language statement with the numbers in it. */
  statement: string
  confidence: Confidence
  /** Days that support the finding — the UI links each one to its entry. */
  evidence: string[]
  /** For associations: average outcome with vs without the factor. */
  withAvg?: number
  withoutAvg?: number
  withN?: number
  withoutN?: number
  /** Which way is better for the person — used to frame advice. */
  helpful: boolean
}

export interface RangeStats {
  daysLogged: number
  avgMood: number | null
  /** Second half minus first half of the range — positive means improving. */
  moodTrend: number | null
  avgSleep: number | null
  lunchOnTimeRate: number | null
  exerciseDays: number
  outdoorsDays: number
  socialDays: number
  lowDays: string[]
  bestDays: string[]
  topStressors: { tag: StressorTag; count: number }[]
  topPositives: { tag: PositiveTag; count: number }[]
  series: { date: string; mood: number | null; energy: number | null }[]
}

const MIN_GROUP = 2
const MIN_EFFECT = 1 // points on the 1–5 scale
const MAX_PATTERNS = 8

const round1 = (n: number) => Math.round(n * 10) / 10
const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length

/** Collapse multiple entries per date and sort ascending. */
export function toDays(points: DayPoint[]): DayPoint[] {
  const byDate = new Map<string, DaySignals[]>()
  for (const p of points) {
    const list = byDate.get(p.date) ?? []
    list.push(p.signals)
    byDate.set(p.date, list)
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, list]) => ({ date, signals: mergeDay(list) }))
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

function confidenceFor(minN: number, effect: number): Confidence {
  if (minN >= 4 && effect >= 1.5) return 'consistent'
  if (minN >= 3 && effect >= 1) return 'emerging'
  return 'tentative'
}

export interface Factor {
  id: string
  /** Phrase for the "with" group, e.g. "you ate lunch on time". */
  withLabel: string
  withoutLabel: string
  test: (s: DaySignals) => boolean | null
  /** 1 = the factor on day d is compared to the outcome on day d+1. */
  lag: 0 | 1
  outcomes: { key: Outcome; label: string }[]
}

/** What a day is judged by: how it felt, and how much energy it had overall. */
export type Outcome = 'mood' | 'energy'

/** The whole day's energy: the mean of whatever parts of the day were mentioned. */
export function dayEnergy(s: DaySignals): number | null {
  const parts = [s.energyMorning, s.energyAfternoon, s.energyEvening].filter((v): v is number => typeof v === 'number')
  return parts.length ? Math.round((parts.reduce((a, b) => a + b, 0) / parts.length) * 10) / 10 : null
}

function outcomeOf(s: DaySignals | undefined, key: Outcome): number | null {
  if (!s) return null
  return key === 'mood' ? s.mood : dayEnergy(s)
}

export const FACTORS: Factor[] = [
  {
    id: 'lunch',
    withLabel: 'ate lunch on time',
    withoutLabel: 'skipped or delayed lunch',
    test: (s) => (s.lunch === null ? null : s.lunch === 'on_time'),
    lag: 0,
    outcomes: [
      { key: 'energy', label: 'energy' },
      { key: 'mood', label: 'mood' },
    ],
  },
  {
    id: 'sleep',
    withLabel: 'slept 7+ hours',
    withoutLabel: 'slept under 7 hours',
    test: (s) => (s.sleepHours === null ? null : s.sleepHours >= 7),
    lag: 0,
    outcomes: [
      { key: 'mood', label: 'mood' },
      { key: 'energy', label: 'energy' },
    ],
  },
  {
    id: 'exercise',
    withLabel: 'moved your body',
    withoutLabel: "didn't exercise",
    test: (s) => s.exercise,
    lag: 0,
    outcomes: [
      { key: 'mood', label: 'mood' },
      { key: 'energy', label: 'energy' },
    ],
  },
  {
    id: 'outdoors',
    withLabel: 'got outside',
    withoutLabel: 'stayed indoors',
    test: (s) => s.outdoors,
    lag: 0,
    outcomes: [{ key: 'mood', label: 'mood' }],
  },
  {
    id: 'social',
    withLabel: 'connected with someone',
    withoutLabel: 'had little contact with people',
    test: (s) => s.social,
    lag: 0,
    outcomes: [{ key: 'mood', label: 'mood' }],
  },
  {
    id: 'screens',
    withLabel: 'put screens down before bed',
    withoutLabel: 'were on screens late',
    test: (s) => (s.lateScreen === null ? null : !s.lateScreen),
    lag: 1,
    outcomes: [
      { key: 'energy', label: 'next-day energy' },
      { key: 'mood', label: 'next-day mood' },
    ],
  },
]

function findAssociations(days: DayPoint[]): Pattern[] {
  const byDate = new Map(days.map((d) => [d.date, d.signals]))
  const out: Pattern[] = []

  for (const f of FACTORS) {
    for (const o of f.outcomes) {
      const withVals: { date: string; v: number }[] = []
      const withoutVals: { date: string; v: number }[] = []
      for (const d of days) {
        const factor = f.test(d.signals)
        if (factor === null) continue
        const target = f.lag ? byDate.get(addDays(d.date, 1)) : d.signals
        const v = outcomeOf(target, o.key)
        if (v === null) continue
        ;(factor ? withVals : withoutVals).push({ date: d.date, v })
      }
      if (withVals.length < MIN_GROUP || withoutVals.length < MIN_GROUP) continue

      const wAvg = mean(withVals.map((x) => x.v))
      const woAvg = mean(withoutVals.map((x) => x.v))
      const diff = wAvg - woAvg
      if (Math.abs(diff) < MIN_EFFECT) continue

      // Evidence: the days on the worse side whose outcome actually dipped.
      const worse = diff > 0 ? withoutVals : withVals
      const worseAvg = Math.min(wAvg, woAvg)
      const evidence = worse.filter((x) => x.v <= Math.max(worseAvg, 2.5)).map((x) => x.date)

      const minN = Math.min(withVals.length, withoutVals.length)
      const [hi, lo] = diff > 0 ? [f.withLabel, f.withoutLabel] : [f.withoutLabel, f.withLabel]
      const statement =
        `On days you ${lo}, your ${o.label} averaged ${round1(Math.min(wAvg, woAvg))}/5 ` +
        `vs ${round1(Math.max(wAvg, woAvg))}/5 on days you ${hi} ` +
        `(${withoutVals.length + withVals.length} days compared).`

      out.push({
        id: `${f.id}:${o.key}`,
        kind: 'association',
        statement,
        confidence: confidenceFor(minN, Math.abs(diff)),
        evidence: evidence.length ? evidence : worse.map((x) => x.date),
        withAvg: round1(wAvg),
        withoutAvg: round1(woAvg),
        withN: withVals.length,
        withoutN: withoutVals.length,
        helpful: diff > 0,
      })
    }
  }
  return out
}

/**
 * Which stressors keep showing up on hard days, and which positives on good
 * ones. A tag needs to appear at least twice, and mostly on that side.
 */
function findTriggersAndLifts(days: DayPoint[]): Pattern[] {
  const rated = days.filter((d) => typeof d.signals.mood === 'number')
  const out: Pattern[] = []

  const scan = <T extends string>(
    pick: (s: DaySignals) => T[],
    vocab: Record<T, string>,
    isSide: (mood: number) => boolean,
    kind: 'trigger' | 'lift',
  ) => {
    const seen = new Map<T, string[]>()
    for (const d of rated) for (const t of pick(d.signals)) seen.set(t, [...(seen.get(t) ?? []), d.date])
    for (const [tag, dates] of seen) {
      if (dates.length < 2) continue
      const onSide = dates.filter((date) => isSide(rated.find((d) => d.date === date)!.signals.mood!))
      const rate = onSide.length / dates.length
      if (onSide.length < 2 || rate < 0.66) continue
      const label = vocab[tag].toLowerCase()
      out.push({
        id: `${kind}:${tag}`,
        kind,
        statement:
          kind === 'trigger'
            ? `“${vocab[tag]}” came up on ${dates.length} days, and ${onSide.length === dates.length ? 'every one was a low day' : `${onSide.length} of them were low days`}.`
            : `${vocab[tag]} came up on ${dates.length} days, and ${onSide.length === dates.length ? 'all' : onSide.length} of them were better-than-usual days — ${label} seems to lift you.`,
        // Co-occurrence is weaker evidence than a with/without comparison.
        confidence: onSide.length >= 4 && rate >= 0.8 ? 'emerging' : 'tentative',
        evidence: onSide,
        helpful: kind === 'lift',
      })
    }
  }

  scan((s) => s.stressors, STRESSORS, (m) => m <= 2.5, 'trigger')
  scan((s) => s.positives, POSITIVES, (m) => m >= 3.5, 'lift')
  return out
}

const CONFIDENCE_RANK: Record<Confidence, number> = { consistent: 0, emerging: 1, tentative: 2 }

/** A lift that restates an association already found ("exercise lifts you"
 *  next to "mood is higher on exercise days") is the same finding twice. */
const LIFT_DUPLICATES: Partial<Record<PositiveTag, string>> = {
  exercise: 'exercise:mood',
  nature: 'outdoors:mood',
  friends: 'social:mood',
  family: 'social:mood',
}

const effect = (p: Pattern) =>
  p.withAvg !== undefined && p.withoutAvg !== undefined ? Math.abs(p.withAvg - p.withoutAvg) : 0

export function findPatterns(points: DayPoint[]): Pattern[] {
  const days = toDays(points)
  if (days.length < 4) return []
  const associations = findAssociations(days)
  const found = new Set(associations.map((p) => p.id))
  const tagged = findTriggersAndLifts(days).filter((p) => {
    const dup = p.kind === 'lift' ? LIFT_DUPLICATES[p.id.slice('lift:'.length) as PositiveTag] : undefined
    return !dup || !found.has(dup)
  })
  return [...associations, ...tagged]
    .sort(
      (a, b) =>
        CONFIDENCE_RANK[a.confidence] - CONFIDENCE_RANK[b.confidence] ||
        effect(b) - effect(a) ||
        b.evidence.length - a.evidence.length,
    )
    .slice(0, MAX_PATTERNS)
}

function countTags<T extends string>(days: DayPoint[], pick: (s: DaySignals) => T[]) {
  const counts = new Map<T, number>()
  for (const d of days) for (const t of pick(d.signals)) counts.set(t, (counts.get(t) ?? 0) + 1)
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 4)
    .map(([tag, count]) => ({ tag, count }))
}

export function computeStats(points: DayPoint[]): RangeStats {
  const days = toDays(points)
  const moods = days.filter((d) => d.signals.mood !== null).map((d) => ({ date: d.date, mood: d.signals.mood! }))
  const sleeps = days.map((d) => d.signals.sleepHours).filter((v): v is number => v !== null)
  const lunches = days.map((d) => d.signals.lunch).filter((v) => v !== null)
  const half = Math.floor(moods.length / 2)

  return {
    daysLogged: days.length,
    avgMood: moods.length ? round1(mean(moods.map((m) => m.mood))) : null,
    moodTrend:
      moods.length >= 4
        ? round1(mean(moods.slice(-half).map((m) => m.mood)) - mean(moods.slice(0, half).map((m) => m.mood)))
        : null,
    avgSleep: sleeps.length ? round1(mean(sleeps)) : null,
    lunchOnTimeRate: lunches.length ? round1(lunches.filter((l) => l === 'on_time').length / lunches.length) : null,
    exerciseDays: days.filter((d) => d.signals.exercise).length,
    outdoorsDays: days.filter((d) => d.signals.outdoors).length,
    socialDays: days.filter((d) => d.signals.social).length,
    lowDays: moods.filter((m) => m.mood <= 2).map((m) => m.date),
    bestDays: moods.filter((m) => m.mood >= 4.5).map((m) => m.date),
    topStressors: countTags(days, (s) => s.stressors),
    topPositives: countTags(days, (s) => s.positives),
    series: days.map((d) => ({ date: d.date, mood: d.signals.mood, energy: dayEnergy(d.signals) })),
  }
}

export interface HabitDay {
  date: string
  done: boolean | null // null = no entry / not mentioned
}

export interface HabitProgress {
  days: HabitDay[]
  doneCount: number
  /** Consecutive done days ending at the most recent day with data. */
  streak: number
  /** "Never miss twice" — the last two days with data were both misses. */
  missedTwice: boolean
  /** Exactly one miss most recently: today is the day to get back on track. */
  missedOnce: boolean
}

/** Fill a habit's track record from journal signals over [start, end]. */
export function habitProgress(signal: HabitSignal, points: DayPoint[], start: string, end: string): HabitProgress {
  const byDate = new Map(toDays(points).map((d) => [d.date, d.signals]))
  const test = HABIT_SIGNALS[signal].test
  const days: HabitDay[] = []
  for (let d = start; d <= end; d = addDays(d, 1)) {
    const s = byDate.get(d)
    days.push({ date: d, done: s ? test(s) : null })
  }
  const known = days.filter((d) => d.done !== null)
  let streak = 0
  for (let i = known.length - 1; i >= 0 && known[i].done; i--) streak++
  const last2 = known.slice(-2)
  return {
    days,
    doneCount: known.filter((d) => d.done).length,
    streak,
    missedTwice: last2.length === 2 && last2.every((d) => d.done === false),
    missedOnce: last2.length >= 1 && last2[last2.length - 1].done === false && !(last2.length === 2 && last2[0].done === false),
  }
}
