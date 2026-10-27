import { test, expect } from '@playwright/test'
import { promises as fs } from 'fs'

test('Admin: create promotion and preview', async ({ browser, baseURL }) => {
  // Use a fresh context seeded from storageState so sessionStorage (token) exists
  const storageState = 'tests/e2e/storageState.json'
  const context = await browser.newContext({ storageState }).catch(async () => {
    // fallback: create default context if storageState not available
    return browser.newContext()
  })

  // Ensure the page origin has the admin session token in sessionStorage.
  // Read the storageState file and inject its `bgg-shop.session` into pages' sessionStorage
  try {
    const stateRaw = await fs.readFile(storageState, 'utf8').catch(() => null)
    if (stateRaw) {
      const st = JSON.parse(stateRaw)
      let sessionValue = null
      const targetOrigin = new URL(baseURL || 'http://localhost:3000').origin
      if (Array.isArray(st.origins)) {
        const originEntry = st.origins.find(o => o.origin === targetOrigin)
        if (originEntry && Array.isArray(originEntry.sessionStorage)) {
          const entry = originEntry.sessionStorage.find(s => s.name === 'bgg-shop.session')
          if (entry && entry.value) sessionValue = entry.value
        }
        if (!sessionValue) {
          // fallback: first sessionStorage entry with the key
          for (const o of st.origins) {
            if (Array.isArray(o.sessionStorage)) {
              const entry = o.sessionStorage.find(s => s.name === 'bgg-shop.session')
              if (entry && entry.value) {
                sessionValue = entry.value
                break
              }
            }
          }
        }
      }
      if (sessionValue) {
        // addInitScript runs before any page loads in this context
        await context.addInitScript({ content: `window.sessionStorage.setItem('bgg-shop.session', ${JSON.stringify(sessionValue)});` })
      }
    }
  } catch (e) {}

  const page = await context.newPage()
  // No debug console capture in CI run
  const apiTarget = process.env.PW_API_TARGET || 'http://localhost:5000'
  await page.route('**/api/**', async route => {
    const req = route.request()
    const url = req.url()
    const newUrl = url.replace(/^https?:\/\/[^/]+/, apiTarget)
    if (url.includes('/api/v1/admin/promotions')) {
      try {
        await fs.mkdir('tests/e2e/diagnostics', { recursive: true })
        await fs.writeFile(`tests/e2e/diagnostics/ui_prom_req_${Date.now()}.json`, JSON.stringify({ url: newUrl, method: req.method(), postData: req.postData() }, null, 2))
      } catch (e) {}
    }
    return route.continue({ url: newUrl })
  })

  await page.goto(`${baseURL}/admin/promotions`)
  // No per-request diagnostic writes in CI run
  await page.click('a:has-text("Crear promoción")')
  await expect(page).toHaveURL(/\/admin\/promotions\/new/)

  // Use label based selectors present on the form
  await page.getByLabel('Nombre').fill('E2E Promo')
  // If percentage label exists use it, otherwise try Valor
  const percentage = page.getByLabel('Porcentaje')
  if (await percentage.count() > 0) {
    // field may be a select
    const el = percentage.first()
    const tag = await el.evaluate(e => e.tagName.toLowerCase())
    if (tag === 'select') {
      // Wait for options to populate (some pages load options asynchronously)
      try {
        await page.waitForFunction((selector) => {
          const s = document.querySelector(selector) as HTMLSelectElement | null
          if (!s) return false
          const opts = Array.from(s.options || [])
          return opts.some(o => o.label === '10' || o.value === '10')
        }, el.evaluateHandle(e => e).then(h => h.asElement() ? `#${(h.asElement() as any).id}` : null).catch(() => null), { timeout: 5000 })
      } catch (waitErr) {
        // ignore; we'll try to set directly below
      }
      // Try native selectOption, then fallback to setting value + change event
      try {
        await el.selectOption({ label: '10' })
      } catch (e1) {
        try {
          await el.selectOption({ value: '10' })
        } catch (e2) {
          // Fallback: set value via DOM and dispatch change
          await el.evaluate((s: HTMLSelectElement) => {
            const opt = Array.from(s.options).find(o => o.label === '10' || o.value === '10')
            if (opt) {
              s.value = opt.value
              s.dispatchEvent(new Event('change', { bubbles: true }))
            }
          })
        }
      }
      // Ensure the 'Valor' input is filled as well (some forms require it even when type is percentage)
      const valorInput = page.getByRole('textbox', { name: /Valor/ })
      if (await valorInput.count() > 0) {
        await valorInput.fill('10')
        // Trigger input/change events in case the form validates on blur/input
        await valorInput.evaluate((el: HTMLInputElement) => {
          el.dispatchEvent(new Event('input', { bubbles: true }))
          el.dispatchEvent(new Event('change', { bubbles: true }))
        })
        await valorInput.press('Tab').catch(() => null)
      }
    } else {
      await el.fill('10')
    }
  } else {
    const valor = page.getByLabel('Valor')
    if (await valor.count() > 0) await valor.fill('10')
  }

  // preview if available
  const previewBtn = page.getByRole('button', { name: /Previsualizar|Previsualizar/i })
  if (await previewBtn.count() > 0) {
    await previewBtn.click()
    await expect(page.locator('body')).toContainText('%')
  }

  // Capture validation state
  const invalidMsgs = await page.evaluate(() => Array.from(document.querySelectorAll('*')).filter(n => /inválido/i.test(n.textContent || '')).map(n => n.textContent?.trim()))
  // Fail early if there are validation messages
  if (invalidMsgs && invalidMsgs.length > 0) {
    throw new Error('Form has validation messages: ' + JSON.stringify(invalidMsgs))
  }
  // No forced POST in standard CI run
  // Click save and wait for any network response related to promotions
  const waitForPromResp = page.waitForResponse((r) => {
    const u = r.url()
    return u.includes('/admin/promotions') || u.includes('/graphql')
  }, { timeout: 15000 }).catch(() => null)

  await page.click('button:has-text("Guardar")')

  const promResp = await waitForPromResp
  if (!promResp) {
    // Persist page snapshot for debugging and fail with context
    await fs.mkdir('tests/e2e/diagnostics', { recursive: true })
    const html = await page.content()
    await fs.writeFile(`tests/e2e/diagnostics/prom_page_no_resp_${Date.now()}.html`, html)
    throw new Error('No promotions network response observed after clicking Guardar; saved page HTML for inspection')
  }

    try {
      const txt = await promResp.text().catch(() => null)
      await fs.writeFile(`tests/e2e/diagnostics/prom_resp_${Date.now()}.json`, JSON.stringify({ url: promResp.url(), status: promResp.status(), text: txt }, null, 2))
    } catch (e) {}

  await expect(page).toHaveURL(/\/admin\/promotions$/)
  await context.close()
})
