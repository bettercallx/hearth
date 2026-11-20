import type { DaySignals, HabitSignal } from './signals'
import type { Pattern, RangeStats } from './patterns'
import type { Suggestion } from '../server/journal-ai'

export type Entry = {
  userId?: string
  text: string
  entryDate: string
  source: 'text' | 'voice'
  status: 'pending' | 'analyzed' | 'failed'
  mood?: number | null
  moodTags?: string[]
  summary?: string
  reflection?: string
  signals?: DaySignals
  riskFlag?: boolean
  isDemo?: boolean
  /** Friends this entry is shared with in the exchange diary; empty = private. */
  sharedWith?: string[]
}

export type Insight = {
  userId: string
  rangeStart: string
  rangeEnd: string
  days: number
  trigger: 'manual' | 'weekly'
  narrative: string
  identity: string
  highlights: { date: string; text: string }[]
  patterns: (Pattern & { note?: string })[]
  suggestions: Suggestion[]
  stats: RangeStats
}

export type Habit = {
  userId?: string
  name: string
  identity: string
  stack: string
  twoMinute: string
  signal: HabitSignal | ''
  active: boolean
}
