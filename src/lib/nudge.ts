/**
 * "For tomorrow" nudges: when today's entry lands on the worse side of one of
 * the person's own patterns, offer one small, concrete next step and the
 * habit that would carry it. Pure code over computed patterns: no model call,
 * no invented numbers, and the evidence is the person's own days.
 */

import { FACTORS, type Pattern } from './patterns'
import type { DaySignals, HabitSignal } from './signals'

export interface HabitTemplate {
  name: string
  signal: HabitSignal
  stack: string
  twoMinute: string
}

export interface Nudge {
  patternId: string
  /** What happened today, tied to the pattern's numbers. */
  observation: string
  /** One step, no preamble: the card's heading says when. */
  tip: string
  when: 'tomorrow' | 'tonight'
  habit: HabitTemplate
  evidence: string[]
}

/** One habit per factor, written with Atomic Habits' stacking and two-minute rule. */
const PLAYBOOK: Record<string, { today: string; tip: string; when: Nudge['when']; habit: HabitTemplate }> = {
  lunch: {
    today: 'Lunch slipped today.',
    tip: 'Set an 11:45 alarm and eat before the next thing starts.',
    when: 'tomorrow',
    habit: {
      name: 'Lunch before 1pm',
      signal: 'lunch_on_time',
      stack: 'When my 11:45 alarm goes off, I will go get lunch.',
      twoMinute: 'Eat the snack I keep in my bag.',
    },
  },
  sleep: {
    today: 'Last night was a short one.',
    tip: 'Phone charges outside the bedroom by 10:30.',
    when: 'tonight',
    habit: {
      name: 'Seven hours of sleep',
      signal: 'sleep_7',
      stack: 'After I brush my teeth, I will put my phone on the charger in the kitchen.',
      twoMinute: 'Put the phone face-down across the room.',
    },
  },
  exercise: {
    today: "You didn't get to move much today.",
    tip: 'A 10-minute walk right after lunch counts.',
    when: 'tomorrow',
    habit: {
      name: 'Move every day',
      signal: 'exercise',
      stack: 'After I finish lunch, I will walk around the block.',
      twoMinute: 'Put on my shoes and step outside.',
    },
  },
  outdoors: {
    today: 'Today was an indoor day.',
    tip: 'Five minutes outside, even just to the corner.',
    when: 'tomorrow',
    habit: {
      name: 'Get outside',
      signal: 'outdoors',
      stack: 'After my first coffee, I will step outside for five minutes.',
      twoMinute: 'Open the door and stand outside for a minute.',
    },
  },
  social: {
    today: 'Not much time with people today.',
    tip: 'Send one message to someone you like.',
    when: 'tomorrow',
    habit: {
      name: 'Connect with someone',
      signal: 'social',
      stack: 'After dinner, I will text one friend.',
      twoMinute: 'Send someone a single line.',
    },
  },
  screens: {
    today: 'Screens ran late tonight.',
    tip: 'Phone in another room 30 minutes before bed.',
    when: 'tonight',
    habit: {
      name: 'Screens down before bed',
      signal: 'no_late_screen',
      stack: 'When I get into bed, my phone stays on the desk.',
      twoMinute: 'Turn the phone face-down and out of reach.',
    },
  },
}

const RANK = { consistent: 0, emerging: 1, tentative: 2 } as const

/** The strongest pattern today landed on the wrong side of, if any. */
export function nudgeFor(today: DaySignals, patterns: Pattern[]): Nudge | null {
  const candidates = patterns
    .filter((p) => p.kind === 'association')
    .map((p) => {
      const [factorId, outcome] = p.id.split(':')
      const factor = FACTORS.find((f) => f.id === factorId)
      const play = PLAYBOOK[factorId]
      if (!factor || !play || p.withAvg === undefined || p.withoutAvg === undefined) return null
      const value = factor.test(today)
      if (value === null) return null
      // `helpful` means the "with" side is better; today is on the worse side if it differs.
      if (value === p.helpful) return null
      const label = factor.outcomes.find((o) => o.key === outcome)?.label ?? outcome
      const worse = Math.min(p.withAvg, p.withoutAvg)
      const better = Math.max(p.withAvg, p.withoutAvg)
      const n = p.helpful ? p.withoutN : p.withN
      return {
        p,
        nudge: {
          patternId: p.id,
          observation: `${play.today} On ${n} of your days like this, your ${label} averaged ${worse}/5, against ${better}/5 otherwise.`,
          tip: play.tip,
          when: play.when,
          habit: play.habit,
          evidence: p.evidence,
        } satisfies Nudge,
      }
    })
    .filter((c): c is NonNullable<typeof c> => c !== null)
    .sort(
      (a, b) =>
        RANK[a.p.confidence] - RANK[b.p.confidence] ||
        Math.abs(b.p.withAvg! - b.p.withoutAvg!) - Math.abs(a.p.withAvg! - a.p.withoutAvg!),
    )
  return candidates[0]?.nudge ?? null
}
