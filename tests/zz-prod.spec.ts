import { test, expect } from 'deepspace/testing'
test.use({ baseURL: 'https://hearth.app.space' })
test.setTimeout(120_000)
test('prod photo repro', async ({ users }) => {
  const [alice] = await users(['Alice'])
  const p = alice.page
  await p.goto('/exchange')
  await expect(p.getByTestId('page-input')).toBeVisible({ timeout: 20000 })
  await p.getByTestId('page-input').fill('__test__ prod photo repro')
  await p.getByTestId('photo-input').setInputFiles('tests/fixtures/sketch.png')
  const up = p.waitForResponse((r) => r.url().includes('/api/files/upload'))
  const call = p.waitForRequest((r) => r.url().endsWith('/api/actions/analyzeEntry'))
  await p.getByTestId('pass-notebook').click()
  const upRes = await up
  console.log('UPLOAD', upRes.status(), (await upRes.text()).slice(0, 300))
  const req = await call
  const id = JSON.parse(req.postData() ?? '{}').entryId
  const auth = req.headers()['authorization']
  const photo = await p.request.get(`/api/photos/${id}`, { headers: { authorization: auth } })
  const buf = await photo.body()
  console.log('PHOTO', photo.status(), photo.headers()['content-type'], buf.length, JSON.stringify(buf.subarray(0, 80).toString('latin1')))
  const img = p.locator(`[data-entry-id="${id}"] [data-testid="entry-photo"] img`)
  await img.waitFor({ timeout: 15000 }).catch(() => {})
  console.log('IMG', await img.count(), await img.evaluate((el: HTMLImageElement) => `${el.src.slice(0, 30)} natural=${el.naturalWidth}x${el.naturalHeight} complete=${el.complete}`).catch((e) => 'n/a ' + e))
  console.log('ENTRYID', id)
})
