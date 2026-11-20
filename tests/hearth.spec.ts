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

/** Entries each test wrote, by page, so afterEach can delete them. */
const created = new Map<Page, string[]>()

/** Type an entry on /home, submit it, and return its record id. */
async function writeEntry(page: Page, text: string): Promise<string> {
  await page.goto('/home')
  await page.getByTestId('type-instead').click()
  await page.getByTestId('entry-input').fill(text)
  const call = page.waitForRequest((r) => r.url().endsWith('/api/actions/analyzeEntry'))
  await page.getByTestId('save-entry').click()
  const id = (JSON.parse((await call).postData() ?? '{}') as { entryId: string }).entryId
  created.set(page, [...(created.get(page) ?? []), id])
  return id
}

test.afterEach(async () => {
  for (const [page, ids] of created) {
    await page.unroute('**/api/actions/analyzeEntry').catch(() => {})
    await page.goto('/journal')
    for (const id of ids) {
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
  // Idempotent: load the sample journal if this account doesn't have it yet.
  const load = page.getByRole('button', { name: 'Load sample journal' })
  const remove = page.getByTestId('clear-demo')
  await expect(load.or(remove)).toBeVisible({ timeout: 20_000 })
  if (await load.isVisible()) {
    await load.click()
    await expect(remove).toBeVisible({ timeout: 30_000 })
  }

  await page.goto('/insights')
  // Month calendar: sample days are colored and open a day summary on tap.
  // (The sample ends yesterday, so step back a month if today is the 1st.)
  const calendar = page.getByTestId('month-calendar')
  await expect(calendar).toBeVisible({ timeout: 20_000 })
  const filled = calendar.locator('button[data-date]:not([disabled])')
  if ((await filled.count()) === 0) await calendar.getByRole('button', { name: 'Previous month' }).click()
  await expect(filled.first()).toBeVisible()
  await filled.last().click()
  await expect(page.getByTestId('day-detail')).toBeVisible()

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
  const habit = page.getByTestId('habit-card').filter({ hasText: habitName })
  await expect(habit.getByTestId('habit-status')).toContainText('6 of the last 14 days')
  await habit.getByRole('button', { name: 'Delete habit' }).click()
  await page.getByRole('button', { name: 'Delete', exact: true }).click()
  await expect(habit).toHaveCount(0)
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
  await page.getByTestId('generate-insight').click()
  const insight = page.getByTestId('insight')
  await expect(insight).toContainText('14-day look-back', { timeout: 90_000 })
  await expect(insight.getByTestId('suggestion').first()).toBeVisible()
  await expect(insight.getByTestId('suggestion').first()).toContainText(/Make it (obvious|attractive|easy|satisfying)/)
})

test("privacy: Bob can neither see nor act on Alice's entries", async ({ users }) => {
  const [alice, bob] = await users(['Alice', 'Bob'])

  // Alice writes a recognizable entry; capture its id from her own action call.
  const marker = `__test-${Date.now()}__ alice-private`
  const aliceEntryId = await writeEntry(alice.page, `${marker} I had a quiet day reading at home.`)
  expect(aliceEntryId).toBeTruthy()
  await expect(alice.page.getByTestId('reflection')).toBeVisible({ timeout: 60_000 })

  // 1. RBAC: Bob's journal never receives Alice's rows over the socket.
  await bob.page.goto('/journal')
  await expect(bob.page.getByRole('heading', { name: 'Your journal' })).toBeVisible({ timeout: 20_000 })
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
