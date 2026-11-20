/**
 * Ten days of a fictional grad student's journal, with pre-extracted signals,
 * so a reviewer sees patterns immediately without spending ten LLM calls.
 * The data is written to contain a few real patterns (skipped lunch → low
 * afternoon energy, deadlines on hard days, nature lifts, late screens →
 * groggy mornings) and some noise that should NOT surface as a pattern.
 */

import type { DaySignals } from './signals'

export interface DemoEntry {
  text: string
  mood: number
  moodTags: string[]
  summary: string
  reflection: string
  signals: DaySignals
}

const s = (p: Partial<DaySignals>): DaySignals => ({
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
  ...p,
})

/** Oldest first; index 0 is ten days ago. */
export const DEMO_ENTRIES: DemoEntry[] = [
  {
    text: "Went for a run along the river before class, first time in weeks. Had lunch with Maya at noon, actually sat down instead of eating at my desk. Afternoon lab went smoothly. In bed by 11, phone in the other room.",
    mood: 4,
    moodTags: ['energized', 'content'],
    summary: 'Morning run, unhurried lunch with Maya, smooth lab afternoon.',
    reflection: 'It sounds like starting with the river gave the whole day a steadier rhythm. That sit-down lunch mattered too.',
    signals: s({ mood: 4, energyMorning: 4, energyAfternoon: 4, energyEvening: 3, sleepHours: 7.5, lunch: 'on_time', exercise: true, outdoors: true, social: true, lateScreen: false, positives: ['exercise', 'nature', 'friends'], activities: ['river run', 'lunch with Maya', 'lab'] }),
  },
  {
    text: "Back-to-back meetings from 10 to 3, never got lunch. By 4pm I couldn't think straight and just stared at the draft. Advisor moved the paper deadline up a week. Scrolled on my phone in bed until 1am.",
    mood: 2,
    moodTags: ['drained', 'anxious'],
    summary: 'Meetings ate lunch; foggy afternoon; paper deadline moved up.',
    reflection: 'That is a lot to absorb on an empty stomach. Of course the afternoon felt foggy — your body was running on nothing.',
    signals: s({ mood: 2, energyMorning: 3, energyAfternoon: 2, energyEvening: 2, sleepHours: 6, lunch: 'skipped', exercise: false, outdoors: false, social: false, lateScreen: true, stressors: ['deadline', 'work_pressure'], activities: ['meetings', 'paper draft'] }),
  },
  {
    text: "Woke up groggy. Grabbed a sandwich around 2:30 because I lost track of time. Coffee with Jordan helped a bit — we laughed about the conference reviews. Still behind on the paper.",
    mood: 3,
    moodTags: ['tired', 'a little lighter'],
    summary: 'Groggy start, late lunch, coffee with Jordan lifted the mood.',
    reflection: 'Even on a tired day you found a moment to laugh with Jordan. That counts for something.',
    signals: s({ mood: 3, energyMorning: 2, energyAfternoon: 2, energyEvening: 3, sleepHours: 5.5, lunch: 'late', exercise: false, outdoors: false, social: true, lateScreen: false, stressors: ['work_pressure'], positives: ['friends'], activities: ['coffee with Jordan', 'paper revisions'] }),
  },
  {
    text: "Only slept six hours but took a 20 minute walk through the park at lunch, then ate on a bench. Finished the related-work section! Felt clear-headed all afternoon.",
    mood: 4,
    moodTags: ['proud', 'clear-headed'],
    summary: 'Park walk and lunch outside; finished related-work section.',
    reflection: 'Finishing that section is real progress. Notice how clear your afternoon felt after the park.',
    signals: s({ mood: 4, energyMorning: 4, energyAfternoon: 4, energyEvening: 3, sleepHours: 6, lunch: 'on_time', exercise: false, outdoors: true, social: false, lateScreen: false, positives: ['nature', 'accomplishment'], activities: ['park walk', 'wrote related work'] }),
  },
  {
    text: "Everything is due at once. Skipped lunch to push on the experiments and crashed hard around 3. Too much on my plate and I don't know what to drop. Vented to my sister on the phone. Watched videos until late to avoid thinking about it.",
    mood: 2,
    moodTags: ['overwhelmed', 'exhausted'],
    summary: 'Skipped lunch for experiments, crashed at 3, felt overwhelmed.',
    reflection: 'When everything is due at once, skipping lunch feels like gaining time — but it seems to cost you the afternoon. You are carrying a lot.',
    signals: s({ mood: 2, energyMorning: 3, energyAfternoon: 1, energyEvening: 2, sleepHours: 6, lunch: 'skipped', exercise: false, outdoors: false, social: true, lateScreen: true, stressors: ['deadline', 'overwhelm'], activities: ['experiments'] }),
  },
  {
    text: "Saturday. Slow, groggy morning but hiked with friends in the afternoon after a proper lunch. Felt like a person again.",
    mood: 4,
    moodTags: ['relieved', 'connected'],
    summary: 'Groggy morning, then a hike with friends after lunch.',
    reflection: '"Felt like a person again" — that says a lot. Friends and trails seem to bring you back.',
    signals: s({ mood: 4, energyMorning: 2, energyAfternoon: 3, energyEvening: 4, sleepHours: 8, lunch: 'on_time', exercise: true, outdoors: true, social: true, lateScreen: false, positives: ['friends', 'exercise', 'nature'], activities: ['hike with friends'] }),
  },
  {
    text: "Called my mom, then cooked a real lunch and ate it on the balcony. Yoga in the evening. Best day in a while.",
    mood: 5,
    moodTags: ['peaceful', 'grateful'],
    summary: 'Call with mom, balcony lunch, evening yoga — best day in a while.',
    reflection: 'A gentle, full day. It might be worth remembering what made it feel this way.',
    signals: s({ mood: 5, energyMorning: 4, energyAfternoon: 4, energyEvening: 4, sleepHours: 8, lunch: 'on_time', exercise: true, outdoors: true, social: true, lateScreen: false, positives: ['family', 'good_food', 'exercise', 'nature'], activities: ['call with mom', 'cooked lunch', 'yoga'] }),
  },
  {
    text: "Tense meeting — my labmate and I disagreed about authorship order and it got awkward. Ate lunch at 3 because I kept replaying it. Went to the gym but couldn't shake it. Doomscrolled in bed again.",
    mood: 2,
    moodTags: ['frustrated', 'unsettled'],
    summary: 'Authorship disagreement with labmate; late lunch; replaying it.',
    reflection: 'Conflict with someone you work next to every day is heavy. It makes sense your mind kept circling back.',
    signals: s({ mood: 2, energyMorning: 4, energyAfternoon: 2, energyEvening: 2, sleepHours: 6.5, lunch: 'late', exercise: true, outdoors: false, social: false, lateScreen: true, stressors: ['conflict', 'work_pressure'], activities: ['lab meeting', 'gym'] }),
  },
  {
    text: "Slept badly and woke up foggy. Kept overthinking yesterday. Made myself take a walk at noon and eat on time, which helped the afternoon even though I still felt flat.",
    mood: 3,
    moodTags: ['flat', 'steadier'],
    summary: 'Foggy, overthinking; noon walk and on-time lunch steadied the afternoon.',
    reflection: 'You took care of yourself on a day you did not feel like it. That is exactly when it counts most.',
    signals: s({ mood: 3, energyMorning: 2, energyAfternoon: 4, energyEvening: 3, sleepHours: 6, lunch: 'on_time', exercise: false, outdoors: true, social: false, lateScreen: false, stressors: ['rumination'], positives: ['nature'], activities: ['noon walk'] }),
  },
  {
    text: "Talked things out with my labmate, we're good. Morning run, lunch at 12:15, and finally got the experiment results I needed. Phone off at 10:30.",
    mood: 4,
    moodTags: ['relieved', 'accomplished'],
    summary: 'Resolved things with labmate; run, on-time lunch, experiment results.',
    reflection: 'You repaired something that was weighing on you and got your results. Today you showed up for yourself in a lot of small ways.',
    signals: s({ mood: 4, energyMorning: 4, energyAfternoon: 4, energyEvening: 4, sleepHours: 7.5, lunch: 'on_time', exercise: true, outdoors: true, social: true, lateScreen: false, positives: ['exercise', 'accomplishment'], activities: ['morning run', 'talked with labmate', 'experiment results'] }),
  },
]
