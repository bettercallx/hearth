import { describe, expect, it } from 'vitest'
import { DEMO_ENTRIES } from './demo'
import { addDays, findPatterns } from './patterns'
import { nudgeFor } from './nudge'
import { EMPTY_SIGNALS } from './signals'

const patterns = findPatterns(DEMO_ENTRIES.map((e, i) => ({ date: addDays('2026-11-01', i), signals: e.signals })))

describe('nudgeFor', () => {
  it('turns a skipped lunch into the lunch nudge, with the real numbers', () => {
    const n = nudgeFor({ ...EMPTY_SIGNALS, lunch: 'skipped' }, patterns)
    expect(n?.patternId).toBe('lunch:energyAfternoon')
    expect(n?.observation).toContain('1.8/5')
    expect(n?.observation).toContain('3.8/5')
    expect(n?.habit.signal).toBe('lunch_on_time')
    expect(n?.evidence.length).toBeGreaterThan(0)
  })

  it('stays quiet on a good day', () => {
    const good = { ...EMPTY_SIGNALS, lunch: 'on_time' as const, sleepHours: 8, outdoors: true, exercise: true, social: true, lateScreen: false }
    expect(nudgeFor(good, patterns)).toBeNull()
  })

  it('stays quiet when today says nothing about any pattern', () => {
    expect(nudgeFor(EMPTY_SIGNALS, patterns)).toBeNull()
  })

  it('stays quiet without patterns, however today went', () => {
    expect(nudgeFor({ ...EMPTY_SIGNALS, lunch: 'skipped' }, [])).toBeNull()
  })

  it('picks the strongest pattern when several match', () => {
    const rough = { ...EMPTY_SIGNALS, lunch: 'skipped' as const, outdoors: false, lateScreen: true }
    // lunch→afternoon energy is the consistent, largest effect in the demo data.
    expect(nudgeFor(rough, patterns)?.patternId).toBe('lunch:energyAfternoon')
  })
})
