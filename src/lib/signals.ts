/**
 * The structured shape the AI extracts from each journal entry, plus the
 * fixed vocabularies that make patterns countable. Free text can't be
 * correlated; a closed set of tags can — so the extractor must map onto these.
 */

export const STRESSORS = {
  work_pressure: 'Work / school pressure',
  deadline: 'Deadlines',
  conflict: 'Conflict with someone',
  loneliness: 'Feeling alone',
  health: 'Health / feeling unwell',
  money: 'Money worries',
  family: 'Family stress',
  commute: 'Commute / travel',
  poor_sleep: 'Poor sleep',
  overwhelm: 'Too much on the plate',
  rumination: 'Overthinking',
} as const

export const POSITIVES = {
  exercise: 'Moving your body',
  nature: 'Time outside',
  friends: 'Time with friends',
  family: 'Time with family',
  creative: 'Making something',
  accomplishment: 'Getting something done',
  rest: 'Real rest',
  learning: 'Learning something',
  good_food: 'A good meal',
  music: 'Music',
  kindness: 'Kindness given or received',
} as const

export type StressorTag = keyof typeof STRESSORS
export type PositiveTag = keyof typeof POSITIVES
export type LunchStatus = 'on_time' | 'late' | 'skipped'

export interface DaySignals {
  /** 1 (very low) – 5 (very good). */
  mood: number | null
  energyMorning: number | null
  energyAfternoon: number | null
  energyEvening: number | null
  /** Hours slept the night before this entry. */
  sleepHours: number | null
  lunch: LunchStatus | null
  exercise: boolean | null
  outdoors: boolean | null
  social: boolean | null
  /** Screens in bed / up late on the phone that night. */
  lateScreen: boolean | null
  stressors: StressorTag[]
  positives: PositiveTag[]
  /** Short phrases of what the person did ("team standup", "ran 5k"). */
  activities: string[]
}

export const EMPTY_SIGNALS: DaySignals = {
  mood: null,
  energyMorning: null,
  energyAfternoon: null,
  energyEvening: null,
  sleepHours: null,
  lunch: null,
  exercise: null,
  outdoors: null,
  social: null,
  lateScreen: null,
  stressors: [],
  positives: [],
  activities: [],
}

const clampScale = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN
  if (!Number.isFinite(n)) return null
  return Math.min(5, Math.max(1, Math.round(n)))
}

const bool = (v: unknown): boolean | null => (typeof v === 'boolean' ? v : null)

const tags = <T extends string>(v: unknown, vocab: Record<T, string>): T[] =>
  Array.isArray(v) ? [...new Set(v.filter((t): t is T => typeof t === 'string' && t in vocab))] : []

/**
 * Coerce untrusted model output into DaySignals. Anything off-vocabulary or
 * out of range becomes null/dropped instead of polluting the statistics.
 */
export function normalizeSignals(raw: unknown): DaySignals {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  const sleep = typeof r.sleepHours === 'number' && r.sleepHours >= 0 && r.sleepHours <= 16 ? r.sleepHours : null
  const lunch = r.lunch === 'on_time' || r.lunch === 'late' || r.lunch === 'skipped' ? r.lunch : null
  return {
    mood: clampScale(r.mood),
    energyMorning: clampScale(r.energyMorning),
    energyAfternoon: clampScale(r.energyAfternoon),
    energyEvening: clampScale(r.energyEvening),
    sleepHours: sleep,
    lunch,
    exercise: bool(r.exercise),
    outdoors: bool(r.outdoors),
    social: bool(r.social),
    lateScreen: bool(r.lateScreen),
    stressors: tags(r.stressors, STRESSORS),
    positives: tags(r.positives, POSITIVES),
    activities: Array.isArray(r.activities)
      ? r.activities.filter((a): a is string => typeof a === 'string').slice(0, 8)
      : [],
  }
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const firstNonNull = <T,>(xs: (T | null)[]) => xs.find((x) => x !== null) ?? null
const anyTrue = (xs: (boolean | null)[]) =>
  xs.some((x) => x === true) ? true : xs.some((x) => x === false) ? false : null

/**
 * Several entries on one day collapse into one data point, so a chatty day
 * doesn't count three times. Scales average, booleans OR, and the most
 * recent explicit lunch status wins (entries arrive oldest first).
 */
export function mergeDay(list: DaySignals[]): DaySignals {
  if (list.length === 1) return list[0]
  const nums = (k: keyof DaySignals) =>
    list.map((s) => s[k]).filter((v): v is number => typeof v === 'number')
  const round = (v: number | null) => (v === null ? null : Math.round(v * 10) / 10)
  return {
    mood: round(avg(nums('mood'))),
    energyMorning: round(avg(nums('energyMorning'))),
    energyAfternoon: round(avg(nums('energyAfternoon'))),
    energyEvening: round(avg(nums('energyEvening'))),
    sleepHours: firstNonNull(list.map((s) => s.sleepHours)),
    lunch: firstNonNull([...list].reverse().map((s) => s.lunch)),
    exercise: anyTrue(list.map((s) => s.exercise)),
    outdoors: anyTrue(list.map((s) => s.outdoors)),
    social: anyTrue(list.map((s) => s.social)),
    lateScreen: anyTrue(list.map((s) => s.lateScreen)),
    stressors: [...new Set(list.flatMap((s) => s.stressors))],
    positives: [...new Set(list.flatMap((s) => s.positives))],
    activities: [...new Set(list.flatMap((s) => s.activities))].slice(0, 12),
  }
}

/** Habit signals a user can link a habit to; filled automatically from entries. */
export const HABIT_SIGNALS = {
  lunch_on_time: { label: 'Lunch on time', test: (s: DaySignals) => (s.lunch === null ? null : s.lunch === 'on_time') },
  sleep_7: { label: '7+ hours of sleep', test: (s: DaySignals) => (s.sleepHours === null ? null : s.sleepHours >= 7) },
  exercise: { label: 'Moved my body', test: (s: DaySignals) => s.exercise },
  outdoors: { label: 'Got outside', test: (s: DaySignals) => s.outdoors },
  social: { label: 'Connected with someone', test: (s: DaySignals) => s.social },
  no_late_screen: {
    label: 'Screens down before bed',
    test: (s: DaySignals) => (s.lateScreen === null ? null : !s.lateScreen),
  },
  journal: { label: 'Wrote in my journal', test: () => true },
} as const

export type HabitSignal = keyof typeof HABIT_SIGNALS
