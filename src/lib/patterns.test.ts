import { describe, expect, it } from 'vitest'
import { DEMO_ENTRIES } from './demo'
import { addDays, computeStats, findPatterns, habitProgress, toDays, type DayPoint } from './patterns'
import { EMPTY_SIGNALS, normalizeSignals } from './signals'

const start = '2026-11-01'
const demo: DayPoint[] = DEMO_ENTRIES.map((e, i) => ({ date: addDays(start, i), signals: e.signals }))

describe('findPatterns on the demo journal', () => {
  const patterns = findPatterns(demo)
  const byId = new Map(patterns.map((p) => [p.id, p]))

  it('links skipped/late lunch to low afternoon energy, with the right days as evidence', () => {
    const p = byId.get('lunch:energyAfternoon')
    expect(p).toBeDefined()
    expect(p!.withAvg).toBeCloseTo(3.8, 1)
    expect(p!.withoutAvg).toBeCloseTo(1.8, 1)
    expect(p!.withoutN).toBe(4)
    expect(p!.helpful).toBe(true)
    // The four skipped/late-lunch days, and nothing else.
    expect(p!.evidence.sort()).toEqual([addDays(start, 1), addDays(start, 2), addDays(start, 4), addDays(start, 7)])
    expect(p!.statement).toContain('skipped or delayed lunch')
  })

  it('compares late screens to the NEXT morning (lagged)', () => {
    const p = byId.get('screens:energyMorning')
    expect(p).toBeDefined()
    expect(p!.withoutAvg).toBe(2)
    // Evidence is the screen night, not the groggy morning after.
    expect(p!.evidence.sort()).toEqual([addDays(start, 1), addDays(start, 4), addDays(start, 7)])
  })

  it('finds deadlines as a trigger', () => {
    expect(byId.get('trigger:deadline')?.evidence.sort()).toEqual([addDays(start, 1), addDays(start, 4)])
  })

  it('does not restate an association as a lift', () => {
    expect(byId.has('outdoors:mood')).toBe(true)
    expect(byId.has('lift:nature')).toBe(false)
  })

  it('caps the list so the person is not buried in findings', () => {
    expect(patterns.length).toBeLessThanOrEqual(8)
  })

  it('does not report a one-off stressor as a pattern', () => {
    // "conflict" appears exactly once in the demo data.
    expect(byId.has('trigger:conflict')).toBe(false)
  })
})

describe('guards against overclaiming', () => {
  it('says nothing with fewer than 4 days', () => {
    expect(findPatterns(demo.slice(0, 3))).toEqual([])
  })

  it('needs at least two days on each side of a comparison', () => {
    // Lunch on time every day but one: no "without" group to compare to.
    const days = demo.map((d, i) => ({
      ...d,
      signals: { ...d.signals, lunch: i === 1 ? ('skipped' as const) : ('on_time' as const) },
    }))
    expect(findPatterns(days).some((p) => p.id.startsWith('lunch:'))).toBe(false)
  })

  it('ignores small differences', () => {
    const flat = demo.map((d) => ({ ...d, signals: { ...d.signals, energyAfternoon: 3 } }))
    expect(findPatterns(flat).some((p) => p.id === 'lunch:energyAfternoon')).toBe(false)
  })
})

describe('toDays / stats', () => {
  it('merges multiple entries on the same day into one data point', () => {
    const merged = toDays([
      { date: start, signals: { ...EMPTY_SIGNALS, mood: 2, lunch: 'skipped' } },
      { date: start, signals: { ...EMPTY_SIGNALS, mood: 4, lunch: 'on_time', exercise: true } },
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0].signals.mood).toBe(3)
    expect(merged[0].signals.lunch).toBe('on_time')
    expect(merged[0].signals.exercise).toBe(true)
  })

  it('computes range stats', () => {
    const stats = computeStats(demo)
    expect(stats.daysLogged).toBe(10)
    expect(stats.avgMood).toBe(3.3)
    expect(stats.lowDays).toHaveLength(3)
    expect(stats.topStressors[0].tag).toBe('work_pressure')
  })
})

describe('normalizeSignals', () => {
  it('drops off-vocabulary tags and clamps scales', () => {
    const s = normalizeSignals({ mood: 9, stressors: ['deadline', 'aliens'], lunch: 'brunch', sleepHours: 40 })
    expect(s.mood).toBe(5)
    expect(s.stressors).toEqual(['deadline'])
    expect(s.lunch).toBeNull()
    expect(s.sleepHours).toBeNull()
  })
})

describe('habitProgress (never miss twice)', () => {
  it('flags two misses in a row and counts streaks', () => {
    const p = habitProgress('lunch_on_time', demo, start, addDays(start, 9))
    expect(p.doneCount).toBe(6)
    expect(p.streak).toBe(2)
    expect(p.missedTwice).toBe(false)

    const twoMisses = habitProgress('lunch_on_time', demo.slice(0, 3), start, addDays(start, 2))
    expect(twoMisses.missedTwice).toBe(true)
  })

  it('leaves days without entries unknown, not missed', () => {
    const p = habitProgress('exercise', demo.slice(0, 1), start, addDays(start, 2))
    expect(p.days.map((d) => d.done)).toEqual([true, null, null])
  })
})
