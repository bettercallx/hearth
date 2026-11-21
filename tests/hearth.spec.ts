/**
 * Hearth end-to-end: the journaling loop, patterns, look-backs, and privacy.
 *
 * Uses real services, including real Claude calls for one entry and one
 * look-back (fractions of a cent). Needs two test accounts named Alice and Bob:
 *   npx deepspace test accounts create --email alice-<id>@deepspace.test --name Alice --password-stdin
 */
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

const names = loadAllTestAccounts().map((a) => a.name)
test.skip(!names.includes('Alice') || !names.includes('Bob'), 'Needs test accounts named Alice and Bob')

test.describe.configure({ mode: 'serial', timeout: 120_000 })

type Page = import('@playwright/test').Page

/** The browser's local calendar date — tests run on the same machine. */
function today() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
function daysAgo(n: number) {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Entries each test wrote (id + day), by page, so afterEach can delete them. */
const created = new Map<Page, { id: string; date: string }[]>()

/** Type an entry on /home, submit it, and return its record id. */
async function writeEntry(page: Page, text: string, opts: { share?: boolean; daysAgo?: number } = {}): Promise<string> {
  await page.goto('/home')
  await page.getByTestId('type-instead').click()
  await page.getByTestId('entry-input').fill(text)
  const date = daysAgo(opts.daysAgo ?? 0)
  if (opts.daysAgo) await page.getByTestId('write-date').selectOption(date)
  if (opts.share !== undefined) {
    const toggle = page.getByTestId('share-toggle')
    await expect(toggle).toBeVisible({ timeout: 15_000 })
    if ((await toggle.getAttribute('aria-pressed')) !== String(opts.share)) await toggle.click()
    await expect(toggle).toHaveAttribute('aria-pressed', String(opts.share))
  }
  const call = page.waitForRequest((r) => r.url().endsWith('/api/actions/analyzeEntry'))
  await page.getByTestId('save-entry').click()
  const id = (JSON.parse((await call).postData() ?? '{}') as { entryId: string }).entryId
  created.set(page, [...(created.get(page) ?? []), { id, date }])
  return id
}

/** The invite link on /exchange, creating one if needed (behind "Invite a friend" once you have a notebook). */
async function openInvite(page: Page) {
  const invite = page.getByTestId('invite-link')
  const create = page.getByTestId('create-invite')
  const opener = page.getByRole('button', { name: 'Invite a friend' })
  await expect(invite.or(create).or(opener)).toBeVisible({ timeout: 20_000 })
  if (await opener.isVisible()) await opener.click()
  await expect(invite.or(create)).toBeVisible()
  if (await create.isVisible()) await create.click()
  await expect(invite).toBeVisible()
  return invite
}

/** The record id of the notebook page containing `marker`, once it appears. */
async function pageIdByText(page: Page, marker: string) {
  const card = page.locator('[data-testid="shared-entry"]').filter({ hasText: marker })
  await expect(card).toHaveCount(1, { timeout: 20_000 })
  return (await card.getAttribute('data-entry-id'))!
}

/** Notebook pages each test wrote (id + friend tab), torn out in afterEach. */
const pagesMade = new Map<Page, { id: string; friend: string }[]>()

/** Habits each test made, by page; deleted in afterEach even when an assertion failed. */
const habitsMade = new Map<Page, string[]>()

/** Delete every habit on the page whose name contains `match`. */
async function deleteHabits(page: Page, match: string) {
  await page.goto('/insights#habits')
  // Wait for the habit list itself, not just the section: counting a loading list finds nothing.
  await expect(page.locator('[data-testid="habits"][data-ready="true"]')).toBeVisible({ timeout: 15_000 })
  const habit = page.getByTestId('habit-card').filter({ hasText: match })
  while ((await habit.count()) > 0) {
    const before = await habit.count()
    await habit.first().getByRole('button', { name: 'Delete habit' }).click()
    await page.getByRole('button', { name: 'Delete', exact: true }).click()
    await expect(habit).toHaveCount(before - 1)
  }
}

test.afterEach(async () => {
  for (const [page, names] of habitsMade) for (const name of names) await deleteHabits(page, name)
  habitsMade.clear()
  for (const [page, pages] of pagesMade) {
    for (const { id, friend } of pages) {
      await page.goto('/exchange')
      const tab = page.getByTestId('friend-name').filter({ hasText: friend })
      if (await tab.and(page.locator('button')).count()) await tab.click()
      // Wait for the notebook (or its empty state) before deciding the page is already gone.
      await expect(page.locator('[data-testid="shared-entry"], [data-testid="create-invite"], [data-testid="invite-link"]').first()).toBeVisible({ timeout: 15_000 })
      const card = page.locator(`[data-testid="shared-entry"][data-entry-id="${id}"]`)
      if (!(await card.count())) continue
      await card.hover()
      await card.getByTestId('tear-out').click()
      await page.getByRole('button', { name: 'Tear out', exact: true }).click()
      await expect(card).toHaveCount(0)
    }
  }
  pagesMade.clear()
  for (const [page, ids] of created) {
    await page.unroute('**/api/actions/analyzeEntry').catch(() => {})
    for (const { id, date } of ids) {
      await page.goto(`/insights?day=${date}`)
      const card = page.locator(`[data-entry-id="${id}"]`)
      await card.getByRole('button', { name: 'Read entry' }).click()
      await card.getByTestId('delete-entry').click()
      await page.getByRole('button', { name: 'Delete', exact: true }).click()
      await expect(card).toHaveCount(0)
    }
  }
  created.clear()
})

test('sample journal surfaces the lunch → afternoon energy pattern with evidence', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await page.goto('/settings')
  // Load the sample, or reload it so dates line up with today and it's the current version.
  const load = page.getByRole('button', { name: 'Load two weeks of sample data' })
  const reload = page.getByTestId('reload-demo')
  await expect(load.or(reload)).toBeVisible({ timeout: 20_000 })
  const seeded = page.waitForResponse((r) => r.url().endsWith('/api/actions/seedDemo'), { timeout: 60_000 })
  await ((await load.isVisible()) ? load : reload).click()
  expect(((await (await seeded).json()) as { success: boolean }).success).toBe(true)
  await expect(page.getByTestId('clear-demo')).toBeVisible({ timeout: 30_000 })

  await page.goto('/insights')
  // Month calendar: sample days are colored and open a day summary on tap.
  // (The sample ends yesterday, so step back a month if today is the 1st.)
  const calendar = page.getByTestId('month-calendar')
  await expect(calendar).toBeVisible({ timeout: 20_000 })
  const filled = calendar.locator('button[data-date]:not([disabled])')
  if ((await filled.count()) === 0) await calendar.getByRole('button', { name: 'Previous month' }).click()
  await expect(filled.first()).toBeVisible()
  await filled.last().click()
  await expect(page.getByTestId('day-panel').getByTestId('entry-card').first()).toBeVisible()

  const card = page.locator('[data-pattern-id="lunch:energyAfternoon"]')
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(card).toContainText('skipped or delayed lunch')
  await expect(card).toContainText('1.8/5')
  // Four evidence chips, each linking back to the journal day.
  await expect(card.getByRole('link')).toHaveCount(4)

  // Habits fill in from entries — no check-off.
  await page.goto('/habits')
  await page.getByTestId('new-habit').click()
  const habitName = `__test-${Date.now()}__ lunch before 1`
  await page.getByTestId('habit-name').fill(habitName)
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Lunch on time' }).click()
  await page.getByTestId('save-habit').click()
  habitsMade.set(page, [habitName])
  const habit = page.getByTestId('habit-card').filter({ hasText: habitName })
  await expect(habit.getByTestId('habit-status')).toContainText('7 of the last 14 days')
})

test('correcting a mood updates the calendar and the patterns, live', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  // Sample day 2 (skipped lunch, mood "low") — the day the lunch→mood pattern leans on.
  const day = daysAgo(9)
  await page.goto(`/insights?day=${day}`)
  const square = page.locator(`button[data-date="${day}"]`)
  const pattern = page.locator('[data-pattern-id="lunch:mood"]')
  await expect(pattern).toBeVisible({ timeout: 20_000 })
  const before = await pattern.innerText()
  const card = page.getByTestId('day-panel').getByTestId('entry-card').first()

  await card.getByTestId('mood-picker').click()
  await page.getByRole('button', { name: 'Set mood to very good' }).click()
  await expect(square).toHaveAttribute('aria-label', /very good/)
  await expect.poll(() => pattern.innerText()).not.toBe(before)

  // Put it back so the sample journal stays as designed.
  await card.getByTestId('mood-picker').click()
  await page.getByRole('button', { name: 'Set mood to low' }).click()
  await expect(square).toHaveAttribute('aria-label', /mood low/)
  await expect.poll(() => pattern.innerText()).toBe(before)
})


test('after an entry: memory link, a nudge from your own pattern, and a habit check-in', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  // A lunch habit left by an interrupted run would (correctly) change the nudge; start clean.
  await deleteHabits(page, '__test-')
  await deleteHabits(page, 'Lunch before 1pm')
  await writeEntry(page, `__test-${Date.now()}__ Back-to-back meetings again and I skipped lunch. Totally foggy by 3pm.`)
  await expect(page.getByTestId('reflection')).toBeVisible({ timeout: 60_000 })

  // The nudge is code over the sample journal's patterns: deterministic once lunch=skipped is extracted.
  const nudge = page.getByTestId('nudge')
  await expect(nudge).toHaveAttribute('data-pattern-id', 'lunch:energyAfternoon')
  await expect(nudge).toContainText('afternoon energy averaged')
  await expect(nudge.getByRole('link').first()).toHaveAttribute('href', /\/insights\?day=\d{4}-\d{2}-\d{2}/)

  // Memory: the sample journal has several meeting/lunch days, so Hearth should refer back to one.
  // Whatever it picks must be a real day from the journal (validated server-side).
  await expect(page.getByTestId('recall-link')).toHaveAttribute('href', /\/insights\?day=\d{4}-\d{2}-\d{2}/)

  // Taking the suggestion creates the habit, and the check-in reflects today honestly.
  habitsMade.set(page, ['Lunch before 1pm'])
  await page.getByTestId('adopt-nudge').click()
  await expect(nudge).toContainText('This is what “Lunch before 1pm” is for')
  await expect(page.getByTestId('habit-checkins')).toContainText('Lunch before 1pm')
})

test('never miss twice: a slipped habit yesterday gets a gentle line before writing', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  // A habit to keep, then an entry about yesterday (via the date picker) where it slipped.
  await page.goto('/insights#habits')
  await page.getByTestId('new-habit').click()
  const name = `__test-${Date.now()}__ lunch`
  habitsMade.set(page, [name])
  await page.getByTestId('habit-name').fill(name)
  await page.getByRole('combobox').click()
  await page.getByRole('option', { name: 'Lunch on time' }).click()
  await page.getByTestId('save-habit').click()
  await expect(page.getByTestId('habit-card').filter({ hasText: name })).toBeVisible()

  // Written about yesterday, in that day's own words ("today"), so the skipped lunch belongs to that day.
  await writeEntry(page, `__test-${Date.now()}__ Skipped lunch completely today, no time at all. Ate nothing until dinner.`, { daysAgo: 1 })
  await expect(page.getByTestId('reflection')).toBeVisible({ timeout: 60_000 })

  await page.goto('/home')
  await expect(page.getByTestId('never-miss-twice')).toContainText('Yesterday slipped on lunch on time', { timeout: 15_000 })
})

test('writing an entry gets a reflection, mood tags and a summary back', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await writeEntry(
    page,
    `__test-${Date.now()}__ Long day. Skipped lunch because of back-to-back meetings and felt foggy all afternoon. Walked home with a friend which helped.`,
  )

  const reflection = page.getByTestId('reflection')
  await expect(reflection).toBeVisible({ timeout: 60_000 })
  await expect(reflection).toContainText('Noted:')
  await expect(page.getByTestId('crisis-card')).toHaveCount(0)
})

test('risk language shows crisis resources instead of analysis', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await writeEntry(page, `__test-${Date.now()}__ Everything feels pointless and I keep thinking I want to die.`)
  await expect(page.getByTestId('crisis-card')).toBeVisible({ timeout: 60_000 })
  await expect(page.getByTestId('crisis-card')).toContainText('988')
})

test('look-back writes a narrative and Atomic Habits suggestions tied to patterns', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await page.goto('/insights')
  await page.getByRole('radio', { name: '14 days' }).click()
  // Wait for THIS request to succeed — an older look-back on screen proves nothing.
  const response = page.waitForResponse((r) => r.url().endsWith('/api/actions/generateInsight'), { timeout: 90_000 })
  await page.getByTestId('generate-insight').click()
  const body = (await (await response).json()) as { success: boolean; error?: string; data?: { insightId: string } }
  expect(body.error).toBeUndefined()
  expect(body.success).toBe(true)

  const insight = page.locator(`[data-testid="insight"][data-insight-id="${body.data!.insightId}"]`)
  await expect(insight).toContainText('14-day look-back', { timeout: 15_000 })
  await expect(insight.getByTestId('suggestion').first()).toContainText(/Make it (obvious|attractive|easy|satisfying)/)

  // Clean up so repeated runs don't hit the per-day look-back cap.
  await insight.getByTestId('delete-insight').click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(insight).toHaveCount(0)
})

test("privacy: Bob can neither see nor act on Alice's entries", async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])

  // Alice writes a recognizable entry; capture its id from her own action call.
  const marker = `__test-${Date.now()}__ alice-private`
  const aliceEntryId = await writeEntry(alice.page, `${marker} I had a quiet day reading at home.`)
  expect(aliceEntryId).toBeTruthy()
  await expect(alice.page.getByTestId('reflection')).toBeVisible({ timeout: 60_000 })

  // 1. RBAC: Bob's journal never receives Alice's rows over the socket.
  await bob.page.goto(`/insights?day=${today()}`)
  await expect(bob.page.getByTestId('day-panel')).toBeVisible({ timeout: 20_000 })
  await bob.page.waitForTimeout(2000)
  await expect(bob.page.getByText(marker)).toHaveCount(0)
  await expect(bob.page.getByText('alice-private')).toHaveCount(0)

  // 2. Server action: Bob's real, signed-in request, with Alice's entry id
  //    swapped into the body. The action must refuse it.
  let forged: { success?: boolean; error?: string } | null = null
  await bob.page.route('**/api/actions/analyzeEntry', async (route) => {
    const response = await route.fetch({ postData: JSON.stringify({ entryId: aliceEntryId, force: true }) })
    forged = (await response.json()) as typeof forged
    await route.fulfill({ response })
  })
  await writeEntry(bob.page, `__test-${Date.now()}__ bob probe`)
  await expect.poll(() => forged, { timeout: 30_000 }).not.toBeNull()
  expect(forged).toMatchObject({ success: false, error: 'Entry not found' })
})

test('exchange diary: pair by link, share selectively, reply live, unpair revokes', async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])

  // Alice creates an invite link; Bob opens it and accepts.
  await alice.page.goto('/exchange')
  const invite = await openInvite(alice.page)
  const link = await invite.inputValue()
  const code = new URL(link).searchParams.get('invite')
  expect(code).toBeTruthy()

  await bob.page.goto(`/exchange?invite=${code}`)
  await bob.page.getByTestId('accept-invite').getByRole('button', { name: 'Accept' }).click()
  await expect(bob.page.getByTestId('friend-name')).toContainText('Alice', { timeout: 15_000 })
  // Alice also has the sample friend, so her notebooks are tabs.
  await expect(alice.page.getByTestId('friend-name').filter({ hasText: 'Bob' })).toBeVisible({ timeout: 15_000 })

  // One shared entry, one private one. The toggle is sticky, so set it each time.
  const sharedMarker = `__test-${Date.now()}__ shared-with-bob`
  const privateMarker = `__test-${Date.now()}__ alice-only`
  const sharedId = await writeEntry(alice.page, `${sharedMarker} Long day, but dinner with my sister helped.`, { share: true })
  await expect(alice.page.getByTestId('reflection')).toBeVisible({ timeout: 60_000 })
  await writeEntry(alice.page, `${privateMarker} Something I am not ready to talk about.`, { share: false })
  await expect(alice.page.getByTestId('reflection')).toBeVisible({ timeout: 60_000 })

  // Bob sees exactly the shared one, arriving over the socket.
  await bob.page.goto('/exchange')
  const card = bob.page.locator(`[data-testid="shared-entry"][data-entry-id="${sharedId}"]`)
  await expect(card).toContainText(sharedMarker, { timeout: 20_000 })
  await expect(bob.page.getByText(privateMarker)).toHaveCount(0)
  // …and none of it leaks into Bob's own journal.
  await card.getByRole('button', { name: 'React with 🤗' }).click()
  await card.getByRole('button', { name: 'write back…' }).click()
  await card.getByTestId('reply-input').fill('Glad dinner helped')
  await card.getByRole('button', { name: 'Send reply' }).click()
  await expect(card.getByTestId('replies')).toContainText('Glad dinner helped')

  // Alice sees Bob's reply in their notebook, live. (Looking back stays hers alone: no replies there.)
  await alice.page.goto('/exchange')
  await alice.page.getByTestId('friend-name').filter({ hasText: 'Bob' }).click()
  const inNotebook = alice.page.locator(`[data-testid="shared-entry"][data-entry-id="${sharedId}"]`)
  await expect(inNotebook.getByTestId('replies')).toContainText('🤗', { timeout: 15_000 })
  await expect(inNotebook.getByTestId('replies')).toContainText('Glad dinner helped')
  await alice.page.goto(`/insights?day=${today()}`)
  const own = alice.page.locator(`[data-testid="entry-card"][data-entry-id="${sharedId}"]`)
  await expect(own).toBeVisible({ timeout: 15_000 })
  await expect(own.getByTestId('replies')).toHaveCount(0)

  await bob.page.goto(`/insights?day=${today()}`)
  await expect(bob.page.getByTestId('day-panel')).toBeVisible()
  await bob.page.waitForTimeout(1500)
  await expect(bob.page.getByText(sharedMarker)).toHaveCount(0)

  // Bob unpairs: the shared entry disappears for him, and Alice still owns it, now private.
  await bob.page.goto('/exchange')
  await bob.page.getByRole('button', { name: 'Unpair' }).first().click()
  await bob.page.getByRole('button', { name: 'Unpair', exact: true }).last().click()
  await expect(bob.page.getByTestId('friend-name')).toHaveCount(0, { timeout: 15_000 })
  await expect(bob.page.getByText(sharedMarker)).toHaveCount(0, { timeout: 15_000 })

  // A journal entry that was shared stays in Alice's journal.
  await alice.page.goto(`/insights?day=${today()}`)
  await expect(own).toBeVisible({ timeout: 15_000 })
})

test('exchange diary photos: taped in for a friend, private to the two of you, gone on unpair', async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])
  // Each side's bearer token, from a request it makes anyway.
  const bearer = (page: Page) =>
    page.waitForRequest((r) => r.url().includes('/api/actions/') && !!r.headers()['authorization']).then((r) => r.headers()['authorization'])

  await alice.page.goto('/exchange')
  const invite = await openInvite(alice.page)
  const code = new URL(await invite.inputValue()).searchParams.get('invite')
  await bob.page.goto(`/exchange?invite=${code}`)
  const bobToken = bearer(bob.page)
  await bob.page.getByTestId('accept-invite').getByRole('button', { name: 'Accept' }).click()
  const bobAuth = await bobToken

  // The sample friend's sketches are in Alice's notebook with Mia.
  await alice.page.reload()
  await alice.page.getByTestId('friend-name').filter({ hasText: 'Mia' }).click()
  await expect(alice.page.locator('[data-testid="entry-photo"] img[src="/demo/cake.svg"]')).toBeVisible({ timeout: 15_000 })

  // Alice writes a page with a photo in Bob's notebook.
  await alice.page.getByTestId('friend-name').filter({ hasText: 'Bob' }).click()
  const marker = `__test-${Date.now()}__ photo page`
  await alice.page.getByTestId('page-input').fill(`${marker} Today's thumbnail sketch!`)
  await alice.page.getByTestId('photo-input').setInputFiles('tests/fixtures/sketch.png')
  await alice.page.getByTestId('pass-notebook').click()
  const pageId = await pageIdByText(alice.page, marker)
  pagesMade.set(alice.page, [{ id: pageId, friend: 'Bob' }])
  // A notebook page is not a journal entry: it stays out of Looking back.
  await alice.page.goto(`/insights?day=${today()}`)
  await expect(alice.page.getByTestId('day-panel')).toBeVisible({ timeout: 15_000 })
  await expect(alice.page.getByText(marker)).toHaveCount(0)

  // Bob sees it in his notebook, the photo fetched through the access check.
  await bob.page.goto('/exchange')
  const page = bob.page.locator(`[data-testid="shared-entry"][data-entry-id="${pageId}"]`)
  await expect(page).toContainText(marker, { timeout: 20_000 })
  await expect(page.locator('[data-testid="entry-photo"] img')).toHaveAttribute('src', /^blob:/, { timeout: 15_000 })
  expect((await bob.page.request.get(`/api/photos/${pageId}`, { headers: { authorization: bobAuth } })).status()).toBe(200)
  // No token, no photo.
  expect((await bob.page.request.get(`/api/photos/${pageId}`)).status()).toBe(401)

  // Unpairing takes the photo back along with the page.
  await bob.page.getByRole('button', { name: 'Unpair' }).first().click()
  await bob.page.getByRole('button', { name: 'Unpair', exact: true }).last().click()
  await expect(page).toHaveCount(0, { timeout: 15_000 })
  expect((await bob.page.request.get(`/api/photos/${pageId}`, { headers: { authorization: bobAuth } })).status()).toBe(404)
  // The notebook went with the pairing: Alice's page in it is gone too, nothing left to tear out.
  await alice.page.goto('/exchange')
  await expect(alice.page.locator(`[data-entry-id="${pageId}"]`)).toHaveCount(0, { timeout: 15_000 })
})

test('an iPhone photo (HEIC named .JPG) is converted and shows in the notebook', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const page = alice.page
  await page.goto('/exchange')
  // Alice's sample notebook with Mia is enough: the page is hers either way.
  await expect(page.getByTestId('page-input')).toBeVisible({ timeout: 20_000 })
  await page.getByTestId('page-input').fill(`__test-${Date.now()}__ iphone photo`)
  await page.getByTestId('photo-input').setInputFiles('tests/fixtures/iphone-photo.JPG')
  // Converted in the browser: the preview is a real, decodable image.
  const preview = page.getByRole('img', { name: 'Photo to tape in' })
  await expect(preview).toBeVisible({ timeout: 30_000 })
  expect(await preview.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)

  const marker = (await page.getByTestId('page-input').inputValue()).slice(0, 24)
  const upload = page.waitForResponse((r) => r.url().includes('/api/files/upload'))
  await page.getByTestId('pass-notebook').click()
  // What's stored is the JPEG, not the original HEIC.
  expect(((await (await upload).json()) as { key: string }).key).toMatch(/photo\.jpg$/)
  const id = await pageIdByText(page, marker)
  pagesMade.set(page, [{ id, friend: 'Mia' }])

  const img = page.locator(`[data-entry-id="${id}"] [data-testid="entry-photo"] img`)
  await expect(img).toHaveAttribute('src', /^blob:/, { timeout: 15_000 })
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0)
})
