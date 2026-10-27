import { test, expect } from '@playwright/test'
import * as fs from 'fs/promises'

test('Capture Authorization header from page-initiated admin request', async ({ page, baseURL }) => {
  const apiTarget = process.env.PW_API_TARGET || 'http://localhost:5000'
  // Inject page-level hook to capture fetch/XHR calls from the app early
  await page.addInitScript(() => {
    // @ts-ignore
    window._capturedRequests = window._capturedRequests || []
    const origFetch = window.fetch
    // @ts-ignore
    window.fetch = function(input, init) {
      try {
        const url = typeof input === 'string' ? input : input.url
        const hdrs: any = {}
        try {
          const headers = init && init.headers ? init.headers : (typeof input !== 'string' ? input.headers : undefined)
          if (headers) {
            if (headers instanceof Headers) {
              headers.forEach((v, k) => { hdrs[k] = v })
            } else if (Array.isArray(headers)) {
              for (const [k, v] of headers) hdrs[k] = v
            } else if (typeof headers === 'object') {
              Object.assign(hdrs, headers)
            }
          }
        } catch (e) {}
        // @ts-ignore
        window._capturedRequests.push({ url, headers: hdrs })
      } catch (e) {}
      return origFetch.apply(this, arguments as any)
    }
    // capture XHR too
    try {
      const origX = window.XMLHttpRequest.prototype.open
      window.XMLHttpRequest.prototype.open = function(method, url) {
        // store url on instance for later
        // @ts-ignore
        this.__reqUrl = url
        return origX.apply(this, arguments as any)
      }
      const origSend = window.XMLHttpRequest.prototype.send
      window.XMLHttpRequest.prototype.send = function(body) {
        try {
          // @ts-ignore
          const url = this.__reqUrl
          const hdrs = {}
          // can't easily read headers here
          // @ts-ignore
          window._capturedRequests.push({ url, headers: hdrs })
        } catch (e) {}
        return origSend.apply(this, arguments as any)
      }
    } catch (e) {}
  })
  // Route API calls to local API target so the app talks to the test API instance
  await page.route('**/api/**', route => {
    const newUrl = route.request().url().replace(/^https?:\/\/[^/]+/, apiTarget)
    return route.continue({ url: newUrl })
  })

  // Credentials for UI login (adjust via env if needed)
  const loginEmail = process.env.E2E_ADMIN_EMAIL || 'e2e_admin@example.com'
  const loginPassword = process.env.E2E_ADMIN_PASSWORD || 'e2e_password'

  // Capture console.info from the app (ProductsList logs the headers it uses)
  let capturedConsole: string[] = []
  page.on('console', (msg) => {
    try {
      const txt = msg.text()
      if (txt && txt.includes('Admin products list fetch headers')) capturedConsole.push(txt)
    } catch (e) { /* ignore */ }
  })
  // We'll read the page-injected capture buffer (`window._capturedRequests`) instead
  // since it reliably records headers from fetch/XHR. Poll it after navigation.
  let captured: { url: string; headers: any } | null = null

  // Open app and perform UI login
  await page.goto(baseURL)
  await page.goto(`${baseURL}/login`)
  await page.fill('#email', loginEmail)
  await page.fill('#password', loginPassword)
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/auth/login') && r.status() === 200, { timeout: 5000 }).catch(() => null),
    page.click('button:has-text("Iniciar sesión")')
  ])

  // Wait until sessionStorage is populated with bgg-shop.session
  await page.waitForFunction(() => {
    try { return !!sessionStorage.getItem('bgg-shop.session') } catch { return false }
  }, { timeout: 5000 })

  // Read sessionStorage to confirm token presence
  const sessionRaw = await page.evaluate(() => sessionStorage.getItem('bgg-shop.session'))
  let sessionObj: any = null
  try { sessionObj = sessionRaw ? JSON.parse(sessionRaw) : null } catch (e) { sessionObj = null }
  // Emit session content to test stdout for quick inspection
  // eslint-disable-next-line no-console
  console.log('SESSION_CAPTURE', sessionRaw)
  // Save session info into diagnostics
  try {
    await fs.mkdir('tests/e2e/diagnostics', { recursive: true })
    const ts2 = Date.now()
    await fs.writeFile(`tests/e2e/diagnostics/session_capture_${ts2}.json`, JSON.stringify({ sessionRaw, sessionObj }, null, 2))
  } catch (e) { /* ignore */ }

  // Navigate to admin products page (this triggers page-initiated fetch)
  await page.goto(`${baseURL}/admin/products`)

  // Wait for the capture buffer to contain an admin products request
  const start = Date.now()
  while (!captured && Date.now() - start < 5000) {
    // read the page-level captured requests array
    const buf = await page.evaluate(() => {
      // @ts-ignore
      return window._capturedRequests || []
    })
    if (Array.isArray(buf)) {
      const found = buf.find((r: any) => typeof r.url === 'string' && r.url.includes('/api/v1/admin/products'))
      if (found) captured = { url: found.url, headers: found.headers }
    }
    if (!captured) await page.waitForTimeout(100)
  }

  // Persist diagnostic
  try {
    await fs.mkdir('tests/e2e/diagnostics', { recursive: true })
    const ts = Date.now()
    await fs.writeFile(`tests/e2e/diagnostics/page_capture_admin_${ts}.json`, JSON.stringify({ captured, console: capturedConsole }, null, 2))
  } catch (e) { /* ignore write errors */ }

  // Assertions: captured must exist and include Authorization header
  expect(captured, 'Expected an admin products request from the page').not.toBeNull()
  // Authorization may be present as 'authorization' or 'Authorization'
  const headers = captured ? captured.headers : {}
  const auth = headers['authorization'] || headers['Authorization'] || null
  // Log for debugging
  // eslint-disable-next-line no-console
  console.log('Captured page admin request headers', headers)
  expect(auth, 'Authorization header should be present for page-initiated admin requests').toBeTruthy()
})
