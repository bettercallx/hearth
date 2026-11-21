import { describe, expect, it } from 'vitest'
import { DEMO_ENTRIES } from './demo'
import { addDays, computeStats, findPatterns, habitProgress, toDays, type DayPoint } from './patterns'
import { EMPTY_SIGNALS, normalizeSignals } from './signals'

const start = '2026-11-01'
const day = (i: number) => addDays(start, i)
const demo: DayPoint[] = DEMO_ENTRIES.map((e, i) => ({ date: day(i), signals: e.signals }))

describe('findPatterns on the two-week demo journal', () => {
  const patterns = findPatterns(demo)
  const byId = new Map(patterns.map((p) => [p.id, p]))

  it('links skipped/late lunch to low afternoon energy, with the right days as evidence', () => {
    const p = byId.get('lunch:energyAfternoon')
    expect(p).toBeDefined()
    expect(p!.withAvg).toBeCloseTo(3.8, 1)
    expect(p!.withoutAvg).toBeCloseTo(1.8, 1)
    expect(p!.withoutN).toBe(6)
    expect(p!.helpful).toBe(true)
    expect(p!.confidence).toBe('consistent')
    // Exactly the six skipped/late-lunch days.
    expect(p!.evidence.sort()).toEqual([day(1), day(3), day(5), day(6), day(8), day(11)])
    expect(p!.statement).toContain('skipped or delayed lunch')
  })

  it('compares late screens to the NEXT morning (lagged)', () => {
    const p = byId.get('screens:energyMorning')
    expect(p).toBeDefined()
    expect(p!.withoutAvg).toBe(2)
    // Evidence is the screen night, not the groggy morning after.
    expect(p!.evidence.sort()).toEqual([day(1), day(5), day(8), day(11)])
  })

  it('does not restate an association as a lift', () => {
    expect(byId.has('outdoors:mood')).toBe(true)
    expect(byId.has('lift:nature')).toBe(false)
  })

  it('caps the list so the person is not buried in findings', () => {
    expect(patterns.length).toBeLessThanOrEqual(8)
  })
})

describe('triggers', () => {
  // The first nine days, where tag findings aren't crowded out by the cap.
  const patterns = findPatterns(demo.slice(0, 9))
  const byId = new Map(patterns.map((p) => [p.id, p]))

  it('finds deadlines as a trigger: every deadline day was a low day', () => {
    expect(byId.get('trigger:deadline')?.evidence.sort()).toEqual([day(3), day(5), day(8)])
    expect(byId.get('trigger:deadline')?.statement).toContain('every one was a low day')
  })

  it('does not report a one-off stressor as a pattern', () => {
    // "conflict" appears exactly once in the demo data.
    expect(findPatterns(demo).some((p) => p.id === 'trigger:conflict')).toBe(false)
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
    expect(stats.daysLogged).toBe(14)
    expect(stats.avgMood).toBe(3.1)
    expect(stats.lowDays).toHaveLength(5)
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
  it('counts done days and the streak ending at the latest day', () => {
    const p = habitProgress('lunch_on_time', demo, start, day(13))
    expect(p.doneCount).toBe(8)
    expect(p.streak).toBe(2)
    expect(p.missedTwice).toBe(false)
  })

  it('flags two misses in a row', () => {
    // Days 5–6: skipped, then late.
    expect(habitProgress('lunch_on_time', demo.slice(4, 7), day(4), day(6)).missedTwice).toBe(true)
  })

  it('leaves days without entries unknown, not missed', () => {
    const p = habitProgress('exercise', demo.slice(4, 5), day(4), day(6))
    expect(p.days.map((d) => d.done)).toEqual([true, null, null])
  })
})
