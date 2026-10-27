import { test, expect } from '@playwright/test'
import * as process from 'process'
import * as fs from 'fs/promises'

test('Admin: edit existing product', async ({ page, baseURL }) => {
  const apiTarget = process.env.PW_API_TARGET || 'http://localhost:5000'
  await page.route('**/api/**', route => {
    const newUrl = route.request().url().replace(/^https?:\/\/[^/]+/, apiTarget)
    return route.continue({ url: newUrl })
  })

  // Capture outgoing non-GET admin product requests for diagnostics
  page.on('requestfinished', async (req) => {
    try {
      const url = req.url()
      if (url.includes('/api/v1/admin/products') && req.method() !== 'GET') {
        const postData = req.postData()
        await fs.mkdir('tests/e2e/diagnostics', { recursive: true })
        await fs.writeFile(`tests/e2e/diagnostics/outgoingRequest_${Date.now()}.json`, JSON.stringify({ url, method: req.method(), postData }, null, 2))
      }
    } catch (e) {
      // ignore diagnostics errors
    }
  })

  // Instead of creating via UI (flaky list races), create the product via API using the seeded session token
  const productName = `Temp Product for Edit ${Date.now()}`
  // Try to read token deterministically from storageState.json
  let token: string | null = null
  try {
    const raw = await fs.readFile('tests/e2e/storageState.json', 'utf8')
    const st = JSON.parse(raw)
    const origin = st.origins && st.origins.find((o: any) => o.origin && String(o.origin).includes('localhost'))
    const sess = origin && origin.sessionStorage && origin.sessionStorage.find((i: any) => i.name === 'bgg-shop.session')
    if (sess) token = JSON.parse(sess.value).access_token
  } catch (e) {
    // fallback to page sessionStorage if file read fails
    try {
      token = await page.evaluate(() => {
        try { return JSON.parse(sessionStorage.getItem('bgg-shop.session') || '{}').access_token } catch { return null }
      })
    } catch {}
  }
  const headers: any = { 'content-type': 'application/json' }
  if (!token) {
    // Try to obtain a token via the login API (use env overrides if present)
    const loginEmail = process.env.E2E_ADMIN_EMAIL || 'e2e_admin@example.com'
    const loginPassword = process.env.E2E_ADMIN_PASSWORD || 'e2e_password'
    try {
      const loginResp = await page.request.post(`${apiTarget}/api/v1/auth/login`, { data: { email: loginEmail, password: loginPassword } })
      if (loginResp.ok()) {
        const payload = await loginResp.json()
        token = payload.session && payload.session.access_token
      }
    } catch (e) {
      console.warn('Setup login attempt failed', e)
    }
  }
  if (token) headers.authorization = `Bearer ${token}`
  // Ensure the browser context has the same session token so the admin UI is authenticated
  if (token) {
    try {
      await page.addInitScript((t: string) => {
        try {
          const value = JSON.stringify({ access_token: t, refresh_token: t, csrf_token: null })
          sessionStorage.setItem('bgg-shop.session', value)
        } catch (e) { /* ignore */ }
      }, token)
      
      // Small pause to ensure the init script has had time to run
      await page.waitForTimeout(100)
      // navigate after installing init script so sessionStorage is present on load
      await page.goto(baseURL)
    } catch (e) {
      // best-effort: ignore failures and continue (diagnostics will capture auth absence)
    }
  } else {
    // no token; still navigate so diagnostics capture the problem
    await page.goto(baseURL)
  }
  const createPayload = {
    name: productName,
    price: '9.99',
    quantity: 3,
    bggId: Date.now() % 10000000,
    releaseYear: 2023,
    minPlayers: 1,
    maxPlayers: 4,
    playingTimeMinutes: 60,
    minAge: 8,
    maxAge: 99,
    weight: 1.5,
    category: ['Juegos de Estrategia'],
    publisher: 'TestPub',
    imageUrl: '/media/portadas/cover.jpg'
  }
  const createResp = await page.request.post(`${apiTarget}/api/v1/admin/products`, { headers, data: createPayload })
  if (createResp.status() !== 201) {
    throw new Error(`Setup create product failed: ${createResp.status()}`)
  }
  let createdId: any = null
  try {
    const body = await createResp.json()
    createdId = body.bgg_id || body.id || body.data?.id || null
  } catch {
    createdId = null
  }
  if (!createdId) {
    const loc = createResp.headers()['location'] || createResp.headers()['Location'] || ''
    const m = loc.match(/\/(\d+)(?:\/|$)/)
    if (m) createdId = m[1]
  }
  // If response body didn't include an id, check Location header for created resource URL
  if (!createdId) {
    const locHeader = createResp.headers()['location'] || createResp.headers()['Location'] || ''
    const m = locHeader.match(/\/(\d+)(?:\/|$)/)
    if (m) createdId = m[1]
  }

  // Persist the POST response body for diagnostics to help debug missing IDs
  try {
    await fs.mkdir('tests/e2e/diagnostics', { recursive: true })
    const ts = Date.now()
    const respText = await createResp.text()
    await fs.writeFile(`tests/e2e/diagnostics/postResp_${ts}.txt`, respText)
  } catch (w) { /* ignore diag write errors */ }

  // If we have a createdId from the POST response, navigate directly to its edit page.
  if (createdId) {
    try {
      await page.goto(`${baseURL}/admin/products/${createdId}/edit`)
    } catch (e) {
      // ignore navigation errors; fall back to polling below
    }
  }

  // Poll the admin products list for the created product name, then navigate to edit.
  let found: any = null
  const maxPoll = 3
  let lastListJson: any = null
  for (let i = 0; i < maxPoll; i++) {
    const listGetUrl = `${apiTarget}/api/v1/admin/products?search=${encodeURIComponent(productName)}&page_size=100`
    console.log('DIAG: outgoing GET list (search by name)', { url: listGetUrl, headers })
    try {
      await fs.mkdir('tests/e2e/diagnostics', { recursive: true })
      const ts = Date.now()
      await fs.writeFile(`tests/e2e/diagnostics/outgoingGet_list_${ts}.txt`, JSON.stringify({ url: listGetUrl, headers }, null, 2))
    } catch (w) { /* ignore diag write errors */ }
      try {
        const listRes = await page.request.get(listGetUrl, { headers })
        const listJson = await listRes.json()
        lastListJson = listJson
      const items = listJson.results || listJson.items || listJson.data?.results || listJson.data?.items || listJson || []
      let candidate: any = null
      if (Array.isArray(items)) {
        candidate = items.find((p: any) => p.name === productName)
      } else {
        for (const v of Object.values(items)) {
          if (Array.isArray(v)) {
            candidate = v.find((p: any) => p && p.name === productName)
            if (candidate) break
          }
        }
      }
      if (candidate) { found = candidate; break }
    } catch (e) {
      // ignore parse/errors and retry
    }
    await page.waitForTimeout(500)
  }

  // Save and attach the last list response JSON for diagnostics
  try {
    await fs.mkdir('tests/e2e/diagnostics', { recursive: true })
    const ts = Date.now()
    if (lastListJson) {
      await fs.writeFile(`tests/e2e/diagnostics/last_list_response_${ts}.json`, JSON.stringify(lastListJson, null, 2))
      try {
        await test.info().attach('last-list-response.json', { body: Buffer.from(JSON.stringify(lastListJson)), contentType: 'application/json' })
      } catch (attachErr) { /* ignore attach errors */ }
    }
  } catch (w) { /* ignore diag write errors */ }

  if (found && (found.bgg_id || found.id)) {
    const id = found.bgg_id || found.id
    await page.goto(`${baseURL}/admin/products/${id}/edit`)
  } else {
    // Fallback to clicking the row's Edit button if API lookup failed
    const rowSelector = `tr:has-text("${productName}")`
    await page.goto(`${baseURL}/admin/products`, { waitUntil: 'networkidle' })
    await page.waitForSelector(rowSelector, { timeout: 20000 })
    const row = page.locator(rowSelector)
    const editBtn = row.locator('button:has-text("Editar")')
    if (await editBtn.count() === 0) {
      await row.locator('a:has-text("Editar")').first().click()
    } else {
      await editBtn.first().click()
    }
  }

  // update name and save
  await expect(page.locator('body')).toContainText('Editar')
  // Ensure the product name input is present and wait until the
  // form has loaded the original product name so our fill isn't
  // overwritten by the component's async load. Then fill by id.
  await page.waitForSelector('#product-name', { timeout: 5000 })
  // Wait a brief moment for any async form load, but do not require the
  // input to already equal the original name (some flows render empty then
  // populate later). We'll overwrite whatever value exists.
  await page.waitForTimeout(200)
  await page.fill('#product-name', productName + ' - Updated')
  // Small delay to let React settle and then capture the input value for diagnostics
  await page.waitForTimeout(100)
  const inputValue = await page.evaluate(() => {
    const el = document.getElementById('product-name') as HTMLInputElement | null
    return el ? el.value : null
  })
  try {
    await fs.mkdir('tests/e2e/diagnostics', { recursive: true })
    const ts2 = Date.now()
    await fs.writeFile(`tests/e2e/diagnostics/beforeSubmitInput_${ts2}.json`, JSON.stringify({ inputValue }, null, 2))
  } catch (w) { /* ignore diag write errors */ }
  // Fail early if the input doesn't contain the updated name — helps identify if the fill didn't take effect
  if (inputValue !== productName + ' - Updated') {
    throw new Error(`Input value before submit mismatch: ${String(inputValue)}`)
  }

  // Submit edit and wait for the update response (POST/PUT/PATCH)
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/api/v1/admin/products') && r.request().method() !== 'GET', { timeout: 10000 }).catch(() => null),
    page.click('button:has-text("Guardar")'),
  ])
  // Verify via API that the product was updated (more robust than UI list rendering)
  try {
    const currentUrl = page.url()
    const m = currentUrl.match(/\/admin\/products\/(\d+)(?:\/|$)/)
    if (m) {
      const editedId = m[1]
      const getResp = await page.request.get(`${apiTarget}/api/v1/admin/products/${editedId}`, { headers })
      if (getResp.ok()) {
        const prod = await getResp.json()
        const actualName = prod.name || prod.data?.name || prod.result?.name || (prod.results && prod.results[0] && prod.results[0].name)
        if (actualName !== productName + ' - Updated') {
          throw new Error(`API name mismatch: expected "${productName} - Updated", got "${String(actualName)}"`)
        }
      } else {
        throw new Error(`GET after update failed: ${getResp.status()}`)
      }
    } else {
      // fallback to UI assertion when we can't determine the edited id from the URL
      await expect(page.locator('body')).toContainText(productName + ' - Updated')
    }
  } catch (e) {
    // Attach diagnostics and rethrow the error to surface the failure
    try { await fs.writeFile(`tests/e2e/diagnostics/afterSubmit_check_error_${Date.now()}.txt`, String(e)) } catch (w) {}
    throw e
  }
})
