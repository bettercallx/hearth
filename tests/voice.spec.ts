/**
 * Voice entry, end to end: Chromium's fake microphone plays a recorded clip
 * ("I skipped lunch today and felt tired"), the app records it with
 * MediaRecorder, re-encodes it to WAV, and sends it to speech-to-text.
 * Lives in its own file because the fake mic is a browser launch flag.
 */
import { fileURLToPath } from 'node:url'
import { test, expect, loadAllTestAccounts } from 'deepspace/testing'

const clip = fileURLToPath(new URL('./fixtures/voice.wav', import.meta.url))

test.skip(!loadAllTestAccounts().some((a) => a.name === 'Alice'), 'Needs a test account named Alice')
test.use({
  launchOptions: {
    args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', `--use-file-for-fake-audio-capture=${clip}`],
  },
})

test('speaking an entry transcribes it into the editor', async ({ users }) => {
  test.setTimeout(90_000)
  const [alice] = await users(['Alice'])
  await alice.context.grantPermissions(['microphone'])
  const page = alice.page
  await page.goto('/home')
  await page.getByTestId('mic-button').click()
  await expect(page.getByText(/Listening…/)).toBeVisible()
  await page.waitForTimeout(4000)
  await page.getByRole('button', { name: 'Stop recording' }).click()
  // Transcribed text lands in the editor for review; nothing is saved yet.
  await expect(page.getByTestId('entry-input')).toHaveValue(/lunch/i, { timeout: 30_000 })
})
