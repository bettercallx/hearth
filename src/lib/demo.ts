/**
 * Two weeks of sample data, so a reviewer sees everything on one account
 * without spending fourteen LLM calls:
 *
 * - DEMO_ENTRIES: a freelance designer's journal, with pre-extracted signals.
 *   It contains a few real patterns (skipped lunch → low afternoon energy,
 *   deadlines on hard days, getting outside on good ones, late screens →
 *   groggy mornings) and noise that should NOT surface as a pattern.
 * - DEMO_FRIEND_ENTRIES / replies: an exchange diary with Mia, a freelance
 *   illustrator, including sketches and replies both ways.
 */

import type { DaySignals } from './signals'

export interface DemoEntry {
  text: string
  mood: number
  moodTags: string[]
  summary: string
  reflection: string
  signals: DaySignals
  /** Shared with the sample friend in the exchange diary. */
  shared?: boolean
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

/** Oldest first; index 0 is fourteen days ago, the last is yesterday. */
export const DEMO_ENTRIES: DemoEntry[] = [
  {
    text: 'Coworked with Mia at the library all morning, which made it feel like a real job. Proper lunch at the noodle place at noon. Walked home along the park.',
    mood: 4,
    moodTags: ['steady', 'connected'],
    summary: 'Library coworking with Mia, noodle lunch at noon, walk home.',
    reflection: 'Working next to someone seems to give your day a shape. That walk home sounds like it closed it gently.',
    signals: s({ mood: 4, energyMorning: 4, energyAfternoon: 4, energyEvening: 3, sleepHours: 7.5, lunch: 'on_time', exercise: false, outdoors: true, social: true, lateScreen: false, positives: ['friends', 'nature'], activities: ['coworking with Mia', 'noodle lunch', 'park walk'] }),
  },
  {
    text: 'Chased the same invoice for the third time. Skipped lunch to finish a pitch deck nobody asked for yet. Felt flat all afternoon and scrolled in bed until 1.',
    mood: 2,
    moodTags: ['anxious', 'drained'],
    summary: 'Third invoice reminder, skipped lunch for a pitch deck, flat afternoon.',
    reflection: 'Waiting on money you have already earned is its own kind of tired. No wonder the afternoon went flat.',
    signals: s({ mood: 2, energyMorning: 3, energyAfternoon: 2, energyEvening: 2, sleepHours: 6, lunch: 'skipped', exercise: false, outdoors: false, social: false, lateScreen: true, stressors: ['money', 'work_pressure'], activities: ['invoice reminder', 'pitch deck'] }),
    shared: true,
  },
  {
    text: 'Groggy morning. Lunch on time though, and I sketched in the park for an hour just for me. Nothing client-related. It felt good to make something no one will review.',
    mood: 3,
    moodTags: ['groggy', 'a little lighter'],
    summary: 'Groggy start, on-time lunch, an hour of personal sketching in the park.',
    reflection: 'Making something no one will review sounds like it gave something back to you.',
    signals: s({ mood: 3, energyMorning: 2, energyAfternoon: 3, energyEvening: 3, sleepHours: 6.5, lunch: 'on_time', exercise: false, outdoors: true, social: false, lateScreen: false, positives: ['creative', 'nature'], activities: ['personal sketching'] }),
  },
  {
    text: 'Two deadlines landed on the same day. Lunch at 3 standing at the counter. Too much on the plate and I said yes to all of it.',
    mood: 2,
    moodTags: ['overwhelmed', 'tense'],
    summary: 'Two deadlines on one day, lunch at 3pm, overcommitted.',
    reflection: "Two deadlines on one day would squeeze anyone. It sounds like saying yes to everything is starting to cost you.",
    signals: s({ mood: 2, energyMorning: 3, energyAfternoon: 2, energyEvening: 2, sleepHours: 6, lunch: 'late', exercise: false, outdoors: false, social: false, lateScreen: false, stressors: ['deadline', 'overwhelm'], activities: ['two deliveries'] }),
  },
  {
    text: "Went for a run along the river before opening my laptop, first time in weeks. Had lunch with Jordan at noon, actually sat down. The afternoon logo work flowed. In bed by 11, phone in the other room.",
    mood: 4,
    moodTags: ['energized', 'content'],
    summary: 'Morning run, sit-down lunch with Jordan, logo work flowed.',
    reflection: 'It sounds like starting with the river gave the whole day a steadier rhythm. That sit-down lunch mattered too.',
    signals: s({ mood: 4, energyMorning: 4, energyAfternoon: 4, energyEvening: 3, sleepHours: 7.5, lunch: 'on_time', exercise: true, outdoors: true, social: true, lateScreen: false, positives: ['exercise', 'nature', 'friends'], activities: ['river run', 'lunch with Jordan', 'logo work'] }),
    shared: true,
  },
  {
    text: "Back-to-back client calls from 10 to 3, never got lunch. By 4pm I couldn't think straight and just stared at the brand guide. The client moved the launch up a week. Scrolled in bed until 1am.",
    mood: 2,
    moodTags: ['drained', 'anxious'],
    summary: 'Client calls ate lunch; foggy afternoon; launch moved up a week.',
    reflection: 'That is a lot to absorb on an empty stomach. Of course the afternoon felt foggy: your body was running on nothing.',
    signals: s({ mood: 2, energyMorning: 3, energyAfternoon: 2, energyEvening: 2, sleepHours: 6, lunch: 'skipped', exercise: false, outdoors: false, social: false, lateScreen: true, stressors: ['deadline', 'work_pressure'], activities: ['client calls', 'brand guide'] }),
  },
  {
    text: 'Woke up groggy. Grabbed a sandwich around 2:30 because I lost track of time. Coffee with Jordan helped a bit; we laughed about clients who want the logo bigger. Still behind on the launch.',
    mood: 3,
    moodTags: ['tired', 'a little lighter'],
    summary: 'Groggy start, late lunch, coffee with Jordan lifted the mood.',
    reflection: 'Even on a tired day you found a moment to laugh with Jordan. That counts for something.',
    signals: s({ mood: 3, energyMorning: 2, energyAfternoon: 2, energyEvening: 3, sleepHours: 5.5, lunch: 'late', exercise: false, outdoors: false, social: true, lateScreen: false, stressors: ['work_pressure'], positives: ['friends'], activities: ['coffee with Jordan', 'launch assets'] }),
  },
  {
    text: 'Only slept six hours but took a 20 minute walk through the park at lunch, then ate on a bench. Finished the whole icon set! Felt clear-headed all afternoon.',
    mood: 4,
    moodTags: ['proud', 'clear-headed'],
    summary: 'Park walk and lunch outside; finished the icon set.',
    reflection: 'Finishing the icon set is real progress. Notice how clear your afternoon felt after the park.',
    signals: s({ mood: 4, energyMorning: 4, energyAfternoon: 4, energyEvening: 3, sleepHours: 6, lunch: 'on_time', exercise: false, outdoors: true, social: false, lateScreen: false, positives: ['nature', 'accomplishment'], activities: ['park walk', 'icon set'] }),
  },
  {
    text: "Everything is due at once. Skipped lunch to push on the launch files and crashed hard around 3. Too much on my plate and I don't know what to drop. Vented to my sister on the phone. Watched videos until late to avoid thinking about it.",
    mood: 2,
    moodTags: ['overwhelmed', 'exhausted'],
    summary: 'Skipped lunch for launch files, crashed at 3, felt overwhelmed.',
    reflection: 'When everything is due at once, skipping lunch feels like gaining time, but it seems to cost you the afternoon. You are carrying a lot.',
    signals: s({ mood: 2, energyMorning: 3, energyAfternoon: 1, energyEvening: 2, sleepHours: 6, lunch: 'skipped', exercise: false, outdoors: false, social: true, lateScreen: true, stressors: ['deadline', 'overwhelm'], activities: ['launch files', 'call with sister'] }),
    shared: true,
  },
  {
    text: 'Saturday. Slow, groggy morning but hiked with friends in the afternoon after a proper lunch. Felt like a person again.',
    mood: 4,
    moodTags: ['relieved', 'connected'],
    summary: 'Groggy morning, then a hike with friends after lunch.',
    reflection: '"Felt like a person again": that says a lot. Friends and trails seem to bring you back.',
    signals: s({ mood: 4, energyMorning: 2, energyAfternoon: 3, energyEvening: 4, sleepHours: 8, lunch: 'on_time', exercise: true, outdoors: true, social: true, lateScreen: false, positives: ['friends', 'exercise', 'nature'], activities: ['hike with friends'] }),
  },
  {
    text: 'Called my mom, then cooked a real lunch and ate it on the balcony. Yoga in the evening. Best day in a while.',
    mood: 5,
    moodTags: ['peaceful', 'grateful'],
    summary: 'Call with mom, balcony lunch, evening yoga: best day in a while.',
    reflection: 'A gentle, full day. It might be worth remembering what made it feel this way.',
    signals: s({ mood: 5, energyMorning: 4, energyAfternoon: 4, energyEvening: 4, sleepHours: 8, lunch: 'on_time', exercise: true, outdoors: true, social: true, lateScreen: false, positives: ['family', 'good_food', 'exercise', 'nature'], activities: ['call with mom', 'cooked lunch', 'yoga'] }),
  },
  {
    text: "Tense call: the client and I disagreed about the scope and it got awkward. Ate lunch at 3 because I kept replaying it. Went to the gym but couldn't shake it. Doomscrolled in bed again.",
    mood: 2,
    moodTags: ['frustrated', 'unsettled'],
    summary: 'Scope disagreement with a client; late lunch; replaying it.',
    reflection: 'A conflict with someone who pays your rent is heavy. It makes sense your mind kept circling back.',
    signals: s({ mood: 2, energyMorning: 4, energyAfternoon: 2, energyEvening: 2, sleepHours: 6.5, lunch: 'late', exercise: true, outdoors: false, social: false, lateScreen: true, stressors: ['conflict', 'work_pressure'], activities: ['client call', 'gym'] }),
    shared: true,
  },
  {
    text: 'Slept badly and woke up foggy. Kept overthinking yesterday. Made myself take a walk at noon and eat on time, which helped the afternoon even though I still felt flat.',
    mood: 3,
    moodTags: ['flat', 'steadier'],
    summary: 'Foggy, overthinking; noon walk and on-time lunch steadied the afternoon.',
    reflection: 'You took care of yourself on a day you did not feel like it. That is exactly when it counts most.',
    signals: s({ mood: 3, energyMorning: 2, energyAfternoon: 4, energyEvening: 3, sleepHours: 6, lunch: 'on_time', exercise: false, outdoors: true, social: false, lateScreen: false, stressors: ['rumination'], positives: ['nature'], activities: ['noon walk'] }),
  },
  {
    text: "Wrote the client a calm email about scope and they said yes. Morning run, lunch at 12:15, and the final files went out. Laptop closed at 7 like Mia and I promised each other.",
    mood: 4,
    moodTags: ['relieved', 'accomplished'],
    summary: 'Sorted the scope with the client; run, on-time lunch, files delivered.',
    reflection: 'You repaired something that was weighing on you and shipped the work. Today you showed up for yourself in a lot of small ways.',
    signals: s({ mood: 4, energyMorning: 4, energyAfternoon: 4, energyEvening: 4, sleepHours: 7.5, lunch: 'on_time', exercise: true, outdoors: true, social: true, lateScreen: false, positives: ['exercise', 'accomplishment'], activities: ['morning run', 'scope email', 'final delivery'] }),
    shared: true,
  },
]

export interface DemoFriendEntry {
  /** Index into the same fourteen days as DEMO_ENTRIES. */
  day: number
  text: string
  mood: number
  moodTags: string[]
  /** A bundled sketch under /public/demo. */
  photo?: string
}

export const DEMO_FRIEND_ENTRIES: DemoFriendEntry[] = [
  {
    day: 2,
    text: 'Day one of our coworking pact went well, so trying it alone today. Started the roughs for the bakery packaging. Forgot to eat until 4. Again.',
    mood: 3,
    moodTags: ['hopeful', 'hungry'],
  },
  {
    day: 5,
    text: "A collector wants three more revisions on a commission I thought was done. I said yes because I always say yes. Here's what I'm doing instead of replying.",
    mood: 2,
    moodTags: ['tired', 'stuck'],
    photo: '/demo/plant.svg',
  },
  {
    day: 8,
    text: 'Finally sent the cover sketch to the bakery client!! Three hours at the café with my phone in my bag. Real flow, first time this week. Then a call ate the afternoon and I forgot lunch AGAIN.',
    mood: 4,
    moodTags: ['proud', 'scattered'],
    photo: '/demo/cake.svg',
  },
  {
    day: 10,
    text: 'Sold two prints at the Sunday market and a kid asked if I drew the cat on the tote. I did. Here she is, my studio supervisor.',
    mood: 5,
    moodTags: ['happy', 'seen'],
    photo: '/demo/cat.svg',
  },
  {
    day: 12,
    text: 'Tried your no-email-before-noon thing. Painted for two hours straight before opening anything. Why does that work so well??',
    mood: 4,
    moodTags: ['focused', 'calm'],
  },
  {
    day: 13,
    text: "Rainy. Didn't make anything today. Just tea and a library book. That's allowed, right?",
    mood: 3,
    moodTags: ['quiet', 'restless'],
  },
]

export interface DemoReply {
  /** Who wrote it. */
  from: 'me' | 'friend'
  /** Which entry: one of mine by DEMO_ENTRIES index, or the friend's by DEMO_FRIEND_ENTRIES index. */
  on: { mine: number } | { friend: number }
  text?: string
  emoji?: string
}

export const DEMO_REPLIES: DemoReply[] = [
  { from: 'friend', on: { mine: 1 }, emoji: '🤗' },
  { from: 'friend', on: { mine: 1 }, text: 'send them a late fee. you are allowed.' },
  { from: 'me', on: { friend: 1 }, text: 'reply tomorrow. the plant can have today.' },
  { from: 'friend', on: { mine: 4 }, text: 'the river run!! you sound so much lighter' },
  { from: 'me', on: { friend: 2 }, text: "it's SO pretty. but EAT SOMETHING ok??" },
  { from: 'friend', on: { friend: 2 }, text: 'onigiri in my bag tomorrow, promise' },
  { from: 'friend', on: { mine: 8 }, emoji: '❤️' },
  { from: 'me', on: { friend: 3 }, emoji: '🌱' },
  { from: 'me', on: { friend: 3 }, text: 'supervisor is doing an excellent job' },
  { from: 'friend', on: { mine: 11 }, text: 'proud of you for going to the gym anyway' },
  { from: 'friend', on: { mine: 13 }, text: 'told you the email would work. laptop closed at 7 here too' },
  { from: 'me', on: { friend: 5 }, text: 'allowed. rest is part of the work.' },
]
