# Hearth

**A journal that remembers you.** A journal that listens. Talk or type about your day; Hearth reflects back what
it heard, tags your mood, and over a week or two shows you — with the exact days
as evidence — what lifts you and what wears you down. Suggestions follow
*Atomic Habits*, and habits fill themselves in from what you say.

Built on the [DeepSpace SDK](https://docs.deep.space).

## What's in it

| Surface | What it does |
| --- | --- |
| **Hearth** (`/home`, the desk) | Hearth's page in the middle, with **Looking back** (mini calendar, one pattern, letters) and the **exchange diary** (the latest pages and photo from a friend) as windows on either side. While you write or talk the side windows fade and blur ("Just you and Hearth") and come back once Hearth answers. Hearth's page: talk (a hairline under the prompt becomes a live waveform) or write, about today or any of the last seven days. Each entry gets a short reflection that **refers back to a similar past day when there is one** (with a link to it) and mood tags. Right after, at most one **"for tomorrow" nudge** (a single line) when today landed on the wrong side of one of your own patterns, with a one-tap habit. Before writing, a **never-miss-twice** line if a habit slipped yesterday, and a notice when Hearth has written you a letter. Crisis language shows 988 / findahelpline resources instead of analysis. |
| **Looking back** | The journal, habits, patterns and letters in one place. A **month calendar** (from November 2026) colors each day by mood; tap a day to read, delete, share, or **correct the mood** of its entries — corrections feed the pattern analysis. Below: a mood/energy chart and **patterns** over 7/10/14 days, each with its numbers, a confidence level, and links to the supporting days. Ask Hearth for a **letter** about these days: Claude writes it in the first person around the computed patterns, with an identity line, highlights, and up to three Atomic Habits suggestions tied to specific patterns. A weekly letter also arrives by cron every Sunday. Small habits live here too. |
| **Habits** (in Looking back) | Identity, habit stack, two-minute version, and a signal Hearth listens for (lunch on time, 7h sleep, moved, outside, connected, screens down). Tracked automatically from entries; streaks and "never miss twice". |
| **Exchange** | A school-notebook exchange diary with a friend, paired by a one-time invite link: ruled paper, your pen and theirs, photos taped in as polaroids, replies written under each page. A page written here is also a journal entry. One journal, no double writing: a sticky "also shared with …" switch next to Save decides per entry, and entries can be shared or made private later. Friends reply with a line or a reaction, live. Unpairing revokes everything both ways. Crisis-flagged entries are never shared. |

## How the analysis works

1. **Per entry** (`analyzeEntry` action, Claude Haiku): the entry becomes a
   reflection plus structured signals against a *closed vocabulary* — mood and
   energy 1–5, sleep hours, lunch on-time/late/skipped, exercise, outdoors,
   social, late screens, stressor and positive tags. Off-vocabulary output is
   dropped (`src/lib/signals.ts`).
2. **Patterns** (`src/lib/patterns.ts`, pure TypeScript, unit-tested): with/without
   comparisons (e.g. afternoon energy on skipped-lunch days vs on-time days),
   one lagged comparison (late screens → next morning), and stressor/positive
   co-occurrence on low/high days. Minimum two days per side, minimum one-point
   effect, at most eight findings, duplicates folded. Runs identically in the
   browser (live, free) and on the server.
3. **Memory** (`analyzeEntry`): the model also sees the last three weeks of the
   person's own summaries and may refer back to one genuinely similar day. The
   date it returns must be one of the days it was shown, or it is dropped.
4. **Nudges** (`src/lib/nudge.ts`, unit-tested): today's signals are matched
   against patterns from the days *before* today; the strongest one today
   landed on the wrong side of becomes one templated tip and habit. No model call.
5. **Letter / look-back** (`generateInsight` action / `weekly-insights` cron, Claude
   Sonnet): the model receives the computed stats and patterns and only writes
   words around them. Pattern ids, dates and habit signals in its output are
   validated against what was computed; anything invented is dropped.

## Sample data

One button (Today's first-run card, Settings, or the empty Exchange page) loads two
weeks of a freelance designer's journal plus an exchange diary with **Mia**, a
sample friend, with sketches and replies both ways, so one account shows every
feature. Mia is not an account: her rows carry the id `demo-mia`, are written only
by `seedDemo`, are skipped by the weekly letters, and `clearDemo` removes them.

## Privacy

`entries`, `insights` and `habits` are owner-only for every role **including
admin** (`src/schemas/journal-schema.ts`). The one exception is an entry the
owner shares: `sharedWith` is a server-enforced collaborator list, so a friend
receives exactly those rows over the socket and nothing else. Replies are
visible only to their author and the entry's owner. Photos are stored in the
uploader's private file folder; friends receive them only through
`/api/photos/:entryId`, which serves the bytes only to someone who may read the
entry, so unsharing or unpairing takes the photo back too. Server actions run RBAC-off, so each
one checks the caller owns the record it touches. Cron writes are scoped per user.
Risk-flagged entries are never quoted to the look-back model.

## Develop

```bash
npm install
npx deepspace dev start          # http://localhost:5173
npm run test:unit                # pattern engine
npx deepspace test run all       # Playwright, incl. real Claude calls + 2-user privacy test
npx deepspace deploy
```

The Playwright suite needs two local test accounts named `Alice` and `Bob`
(`npx deepspace test accounts create --email alice-<id>@deepspace.test --name Alice --password-stdin`).
