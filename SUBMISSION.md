# Hearth — submission note (DRAFT — edit into your own words)

**What I built.** Hearth is a voice-first journaling companion. You talk or type
about your day. It replies with a short reflection, tags your mood, and pulls
structured signals out of the entry (sleep, lunch timing, energy, exercise,
stressors…). Over 7–14 days it shows *evidence-backed* patterns, e.g. "on days
you skipped or delayed lunch, your afternoon energy averaged 1.8/5 vs 3.8/5",
with links to the exact days. It then writes a look-back with small habit
suggestions built on *Atomic Habits*: the four laws, habit stacking, the
two-minute rule, and never miss twice. Habits track themselves from what you
say, so there's nothing to tick off.

**DeepSpace integrations used.**
- **Auth** for sign-in and gated routes.
- **Records + real-time sync**: entries, insights and habits in the RecordRoom.
  An entry's reflection streams in over the socket when the server action
  writes it.
- **RBAC**: every collection is owner-only for every role, admin included.
- **Server actions**: `analyzeEntry`, `generateInsight`, `seedDemo`, `clearDemo`,
  each with ownership checks and spend caps.
- **AI integration** (`anthropic/chat-completion`): Haiku for per-entry
  analysis, Sonnet for look-backs.
- **Speech integrations**: `speech/speech-to-text` for voice entries and
  `speech/text-to-speech` for a spoken reflection.
- **Cron** (`CronRoom`): weekly look-backs every Sunday, with an admin-only
  run-now panel and history.

**Main tradeoff.** No machine learning, on purpose. Ten days of journaling is
ten data points, which is too few to train anything honest. Instead:
- The LLM's job is narrow: it maps free text onto a fixed vocabulary.
- Plain, unit-tested code does transparent with/without comparisons. It needs at
  least two days per side and a one-point effect, and labels each finding
  tentative / emerging / consistent.
- The LLM only writes words around numbers the code computed. Its pattern ids,
  dates and habit signals are validated, and anything invented is dropped.

The cost: Hearth misses subtle or multi-factor effects, and correlated habits
can show up as separate findings (lunch and getting outside often happen on
the same good days). The UI says plainly that these are hints, not causes. The
benefit: every claim is explainable and traceable to your own entries.

A second tradeoff: privacy over admin convenience. The app owner cannot read
users' journals, even though that makes support and debugging harder.

**What the agent did.** Claude Code (Opus) did the following:
- Read the DeepSpace docs and scaffolded the app.
- Designed the schemas, the RBAC, and the signal vocabulary.
- Wrote the pattern engine with its unit tests, plus the prompts and output
  validation.
- Wrote the server actions and the cron task.
- Built the UI: companion screen, journal, insights, habits, landing page.
- Wrote the Playwright e2e tests, including a two-user privacy test that
  replays Bob's real authenticated request with Alice's entry id.
- Iterated on screenshots, and fixed issues the tests surfaced. Examples:
  pattern overlap and overclaiming; a test-isolation bug that led to adding
  entry deletion; cron writes restricted to admins.

**What I verified myself.** *(Fill in honestly. Suggested checklist:)*
- [ ] Recorded a real voice entry on my laptop mic. Transcription and reflection were sensible.
- [ ] Played the spoken reflection.
- [ ] Loaded the sample journal. The patterns match what I'd expect from reading the entries.
- [ ] Generated a look-back. The suggestions point at real patterns and dates.
- [ ] Signed in as a second account and confirmed I can't see the first account's entries.
- [ ] Ran `npx deepspace test run all` and `npm run test:unit` locally: all green.
- [ ] On the deployed app, used Settings → "Run now" for the weekly job and checked `npx deepspace logs --search cron`.
- [ ] Read the prompts in `src/server/journal-ai.ts` and the thresholds in `src/lib/patterns.ts`.
