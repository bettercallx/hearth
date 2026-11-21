# Hearth

**A journal that remembers you.** Talk or type about your day; Hearth reflects
back what it heard, remembers similar days, and over a week or two shows you,
with the exact days as evidence, what lifts you and what wears you down. Habits
follow *Atomic Habits* and fill themselves in from what you say. A
school-notebook exchange diary lets you pass pages back and forth with a friend.

Built on the [DeepSpace SDK](https://docs.deep.space).

## What's in it

| Surface | What it does |
| --- | --- |
| **The desk** (`/home`) | Hearth's page in the middle, **Looking back** (mini calendar, the strongest pattern, letters) on the left, the **exchange diary** (latest pages from a friend) on the right. While you write or talk, the side windows fade and blur ("Just you and Hearth") until Hearth answers. |
| **Hearth's page** | A big talk button (voice → WAV → transcription) or write, about today or any of the last seven days. Each entry gets a short reflection that **refers back to a similar past day** when there is one (linked) and mood tags. Then at most one **"for tomorrow" nudge**, a single line drawn from your own pattern, with a one-tap habit. Before writing, a **never-miss-twice** line if a habit slipped yesterday. A switch shares an entry with your friends or keeps it to yourself. Crisis language shows 988 / findahelpline resources instead of analysis. |
| **Looking back** (`/insights`) | Your own record. **Small habits** first: the two newest side by side, older ones folded. Then a **month calendar** coloured by mood; a day's entries (with the time written) scroll beside it, where you can read, delete or **correct the mood**, and corrections feed the analysis. Then **Energy & mood**: days by morning, afternoon and evening energy under a mood row, energy by time of day, and the strongest pattern with the rest folded. Last, **a letter from Hearth** about these days; a weekly one arrives by cron every Sunday. |
| **Exchange diary** (`/exchange`) | One ruled notebook per friend, paired by a one-time invite link (or by pasting the link or code). One sheet per week, newest first, with the page to write on at the top. Your pen and theirs, photos taped in as polaroids (iPhone HEIC converted to JPEG), replies and reactions under each page, live. Notebook pages stay in the notebook, out of Looking back and the analysis. Your own pages can be torn out; unpairing removes the notebook's pages. |

## How the analysis works

1. **Per entry** (`analyzeEntry`, Claude Haiku): the entry becomes a reflection
   plus structured signals in a *closed vocabulary*: mood, morning/afternoon/
   evening energy (1–5), sleep hours, lunch on time/late/skipped, exercise,
   outdoors, social, late screens, stressor and positive tags. Off-vocabulary
   output is dropped (`src/lib/signals.ts`).
2. **Patterns** (`src/lib/patterns.ts`, pure TypeScript, unit-tested):
   with/without comparisons of **mood** and **whole-day energy** (the mean of the
   parts mentioned), one lagged comparison (late screens → next day), and
   stressor/positive co-occurrence on low/high days. At least two days per side,
   at least a one-point difference, at most eight findings, duplicates folded.
   The same code runs in the browser (live, free) and on the server.
3. **Memory** (`analyzeEntry`): the model also sees three weeks of the person's
   own summaries and may refer back to one genuinely similar day. A date it
   returns that it wasn't shown is dropped.
4. **Nudges** (`src/lib/nudge.ts`, unit-tested): today's signals are matched
   against patterns from earlier days; the strongest one today missed becomes
   one templated tip and habit. No model call.
5. **Letters** (`generateInsight` / the `weekly-insights` cron, Claude Sonnet):
   the model receives computed stats and patterns and only writes words around
   them. Pattern ids, dates and habit signals in its output are validated;
   anything invented is dropped.

## Sample data

One button (the first-run card on Hearth's page, Settings, or the empty exchange
diary) loads two weeks of a freelance designer's journal plus an exchange diary
with **Mia**, a sample friend, so one account shows every feature. Mia is not an
account: her rows carry the id `demo-mia`, are written only by `seedDemo`, are
skipped by the weekly letters, and `clearDemo` removes them.

## Privacy

`entries`, `insights` and `habits` are owner-only for every role, **admin
included** (`src/schemas/journal-schema.ts`). The one opening is sharing:
`sharedWith` is a server-enforced collaborator list, so a friend receives exactly
those rows over the socket. Replies are visible only to their author and the
entry's owner. Photos live in the uploader's private file folder; a friend gets
them only through `/api/photos/:entryId`, which checks they may read the entry,
so unsharing or unpairing takes the photo back too. Server actions run RBAC-off,
so each checks the caller owns what it touches; cron writes are scoped per user.
Crisis-flagged entries are never shared and never quoted to the letter model.

## Develop

```bash
npm install
npx deepspace dev start          # http://localhost:5173
npm run test:unit                # pattern engine, nudges, parsing
npx deepspace test run all       # Playwright, incl. real Claude calls and two-user privacy tests
npx deepspace deploy
```

The Playwright suite needs two local test accounts named `Alice` and `Bob`
(`npx deepspace test accounts create --email alice-<id>@deepspace.test --name Alice --password-stdin`).
