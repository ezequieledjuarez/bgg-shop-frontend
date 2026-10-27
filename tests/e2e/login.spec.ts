import { test, expect } from '@playwright/test'
import * as fs from 'fs/promises'

test('E2E login produces storageState and BFF accepts token', async ({ browser, request, baseURL }) => {
  // Ensure storageState exists
  const raw = await fs.readFile('tests/e2e/storageState.json', 'utf8')
  const parsed = JSON.parse(raw)
  const origin = parsed.origins && parsed.origins.find((o: any) => o.origin && o.origin.includes('localhost'))
  const sess = origin && origin.sessionStorage && origin.sessionStorage.find((i: any) => i.name === 'bgg-shop.session')
  expect(sess, 'storageState must contain bgg-shop.session').toBeTruthy()

  // Create a browser context seeded with the storageState to verify the browser sees the session
  const context = await browser.newContext({ storageState: 'tests/e2e/storageState.json' })
  // If an init script was generated, load it to set sessionStorage reliably
  try {
    await fs.access('tests/e2e/initSession.js')
    await context.addInitScript({ path: 'tests/e2e/initSession.js' })
  } catch {}
  const page = await context.newPage()
  await page.goto(baseURL || 'http://localhost:3000')

  const rawSession = await page.evaluate(() => sessionStorage.getItem('bgg-shop.session'))
  expect(rawSession).toBeTruthy()
  const session = JSON.parse(rawSession as string)
  expect(session.access_token).toBeTruthy()

  // Use Playwright APIRequest with the token to call BFF directly and expect 200
  const apiTarget = process.env.PW_API_TARGET || 'http://localhost:5000'
  const resp = await request.get(`${apiTarget}/api/v1/admin/products?page=1&page_size=1`, { headers: { Authorization: `Bearer ${session.access_token}` } })
  expect(resp.ok()).toBeTruthy()
  await context.close()
})
