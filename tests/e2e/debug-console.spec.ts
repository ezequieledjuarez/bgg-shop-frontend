import { test } from '@playwright/test'
import * as fs from 'fs/promises'

test('debug: capture console and submit product form', async ({ browser }) => {
  const context = await browser.newContext({ storageState: 'tests/e2e/storageState.json' })
  // Ensure sessionStorage is populated from storageState.json in case Playwright didn't apply it
  try {
    const raw = await fs.readFile('tests/e2e/storageState.json', 'utf8')
    const parsed = JSON.parse(raw)
    const origin = (parsed.origins || []).find((o: any) => o.origin === 'http://localhost:3000')
    if (origin && Array.isArray(origin.sessionStorage)) {
      const entry = origin.sessionStorage.find((e: any) => e.name === 'bgg-shop.session')
      if (entry && entry.value) {
        // Ensure the value is seeded before any page loads
        await context.addInitScript((v) => {
          try {
            sessionStorage.setItem('bgg-shop.session', v)
          } catch (e) {
            // ignore
          }
        }, entry.value)
        console.log('SESSION_STORAGE will be set from file via addInitScript')
      }
    }
  } catch (e) {
    console.log('Could not prepopulate sessionStorage from file', e)
  }
  const page = await context.newPage()
  page.on('console', (msg) => console.log('PAGE LOG:', msg.type(), msg.text()))
  // Log network requests/responses for inspection
  page.on('request', (req) => {
    try {
      if (req.url().includes('/api/v1/admin/products') && req.method() === 'POST') {
        console.log('PAGE REQ:', req.method(), req.url(), JSON.stringify(req.headers()))
      }
    } catch (e) {
      console.log('PAGE REQ ERR', e)
    }
  })
  page.on('response', async (res) => {
    try {
      if (res.url().includes('/api/v1/admin/products') && res.request().method() === 'POST') {
        const headers = res.headers()
        let body = ''
        try {
          body = await res.text()
        } catch {}
        console.log('PAGE RES:', res.status(), res.url(), JSON.stringify(headers), body)
      }
    } catch (e) {
      console.log('PAGE RES ERR', e)
    }
  })
  await page.goto('http://localhost:3000/admin/products/new')
  // dump sessionStorage for debugging
  await page.evaluate(() => console.log('SESSION_STORAGE:', sessionStorage.getItem('bgg-shop.session')))
  await page.fill('#product-name', `Debug Product ${Date.now()}`)
  await page.fill('#product-price', '19.99')
  await page.fill('#product-quantity', '5')
  await page.click('button[type=submit]')
  // wait briefly to allow navigation or console logs
  await page.waitForTimeout(3000)
})
