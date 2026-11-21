# Hearth — submission note

**What I built.** Hearth is a journal that remembers you, aimed at freelancers
who work alone. You talk or type about your day. It replies with a short
reflection, tags your mood, and pulls structured signals out of the entry
(sleep, lunch timing, energy across the day, exercise, stressors…).

Over 7–14 days it shows *evidence-backed* patterns, with links to the exact days.

Habits follow *Atomic Habits* (identity, habit stacking, the two-minute rule) 
and track themselves from what you say, so there's nothing to tick off.

Every Sunday Hearth writes you a letter. A month calendar colours each day by mood, and a
**exchange diary** lets two friends write pages to each other, tape in photos and reply live.

**DeepSpace integrations used.**

- **Auth** for sign-in and gated routes.
- **Records + real-time sync**: entries, insights, habits, friendships, invites
  and replies in the RecordRoom. A reflection streams in over the socket when the
  server action writes it; a friend's page or reply appears live.
- **RBAC**: journal collections are owner-only for every role, admin included.
  The one opening is opt-in sharing: a server-enforced collaborator list per
  entry, so a friend receives only the rows shared with them.
- **Server actions**: `analyzeEntry`, `generateInsight`, `seedDemo`, `clearDemo`,
  `acceptInvite`, `unpair` and `tearOut`, each with ownership checks and spend
  caps.
- **AI integration** (`anthropic/chat-completion`): Haiku for per-entry
  analysis, Sonnet for letters.
- **Speech integration** (`speech/speech-to-text`) for voice entries.
- **File storage (R2)**: photos taped into the exchange diary, private to the
  two friends through an access-checked route.
- **Cron** (`CronRoom`): weekly letters every Sunday, with an admin-only
  run-now panel and history.

**Main tradeoff.** No machine learning. Two weeks of journaling is
fourteen data points, too few to train. Instead:

- The LLM's job is narrow: it maps free text onto a fixed vocabulary.
- Plain, unit-tested code does transparent with/without comparisons. It labels each finding
  tentative / emerging / consistent.

The cost: Hearth misses subtle or multi-factor effects, and correlated habits
can show up as separate findings (lunch and getting outside often happen on the
same good days). The UI says plainly that these are hints, not causes. 

The benefit: every claim is explainable and traceable to your own entries.

A second tradeoff: privacy over admin convenience. The app owner cannot read
users' journals.

**What the agent did.** Claude Code did the following:

- Read the DeepSpace docs and scaffolded the app.
- Designed the schemas, the RBAC, and the signal vocabulary.
- Wrote the pattern engine with its unit tests, plus the prompts and output
  validation.
- Wrote the server actions, the photo route and the cron task.
- Built the UI: the desk, Hearth's page, Looking back, the exchange diary,
  settings and the landing page.
- Wrote the Playwright e2e tests, including two-user privacy tests that replay
  Bob's real authenticated requests against Alice's entries and photos.
- Iterated on screenshots and fixed issues the tests and real use surfaced.
  Examples: transcription failing until recordings were converted to WAV; iPhone
  HEIC photos that wouldn't display; truncated model replies when thinking
  tokens used up the token limit; pattern overlap and overclaiming; cron writes
  restricted to admins; tests passing on stale data.

**What I directed.**

- Read the DeepSpace docs and other repos
- Chose the product direction: a journal for freelancers who work alone,
  grounded in Atomic Habits.
- Decided the analysis approach: explainable statistics over black-box ML.
- Designed the three-panel desk layout and the exchange diary's 
  handwriting style.
- cut timeline view, voice reply, 
  iWatch integration, and photo collage to keep the core path finished.
- Drove UI iterations: mood colors, calendar heatmap, talk button 
  placement.
- Reviewed the generated code step by step.

**What I verified myself.**

- [x] Recorded a real voice entry on my laptop mic.
- [x] Loaded the sample journal. Patterns match the entries.
- [x] Asked for a letter. Suggestions point at real patterns and dates.
- [x] Signed in as a second account and confirmed I can't see the 
  first account's entries.
- [x] Paired two accounts by invite link, wrote notebook pages with 
  a photo, and replied from the other side.
- [x] Ran tests locally: all green.
- [x] Read the prompts and thresholds in the source code.