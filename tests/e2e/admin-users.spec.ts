import { expect, test, type APIRequestContext, type APIResponse, type Page } from '@playwright/test'

// Never load shared storage, record synthetic credentials, or use ambient accounts.
test.use({ storageState: { cookies: [], origins: [] }, screenshot: 'off', video: 'off', trace: 'off' })

const fields = ['id', 'email', 'first_name', 'last_name', 'is_active', 'is_staff', 'is_superuser'].sort()
const runId = process.env.E2E_SPEC012_RUN_ID ?? ''
const password = process.env.E2E_SPEC012_PASSWORD ?? ''
const bff = process.env.PW_BFF_URL ?? ''
const email = (role: string) => `${role}-${runId}@example.test`

async function authorizationDenied(response: APIResponse, status: number) {
  expect(response.status()).toBe(status)
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(await response.json()).toEqual({
    error: status === 401 ? 'Authentication is required.' : 'Administrative permission is required.',
  })
}

function safeUser(user: Record<string, unknown>) {
  expect(Object.keys(user).sort()).toEqual(fields)
  expect(JSON.stringify(user).includes(password)).toBe(false)
}

async function login(page: Page, baseURL: string, role: string) {
  await page.goto(`${baseURL}/login`)
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email(role))
  await page.getByLabel('Contraseña', { exact: true }).fill(password)
  const pending = page.waitForResponse(response =>
    response.url().endsWith('/api/v1/auth/login') && response.request().method() === 'POST')
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  expect((await pending).status()).toBe(200)
  await page.waitForURL(`${baseURL}/`)
  const token = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('bgg-shop.session') ?? '{}').access_token as string | undefined)
  expect(Boolean(token), 'UI login stores a bearer session').toBe(true)
  return token!
}

async function list(request: APIRequestContext, token: string) {
  const response = await request.get(`${bff}/api/v1/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(200)
  const payload = await response.json() as { items: Array<Record<string, unknown>>; next_cursor: string | null }
  expect(Object.keys(payload).sort()).toEqual(['items', 'next_cursor'])
  for (const user of payload.items) safeUser(user)
  return payload.items
}

test.beforeAll(async ({ baseURL }) => {
  expect(process.env.E2E_SPEC012_ISOLATED, 'Run only through the disposable Spec 012 harness').toBe('true')
  expect(process.env.E2E_OPKEY_ISOLATED, 'Shared global setup must remain disabled').toBe('true')
  expect(/^[0-9a-f]{32}$/.test(runId)).toBe(true)
  expect(/^[0-9a-f]{48}$/.test(password)).toBe(true)
  for (const address of [baseURL, bff]) {
    const url = new URL(address ?? '')
    expect(url.protocol).toBe('http:')
    expect(url.hostname).toBe('127.0.0.1')
    expect(Boolean(url.port)).toBe(true)
    expect(url.username + url.password + url.search + url.hash).toBe('')
  }
  expect(baseURL).not.toBe(bff)
})

test('active non-staff Superadmin changes independent flags without exposing credentials', async ({ page, request, baseURL }) => {
  const token = await login(page, baseURL!, 'superadmin')
  const initial = await list(request, token)
  const caller = initial.find(user => user.email === email('superadmin'))
  expect(caller).toMatchObject({ is_active: true, is_staff: false, is_superuser: true })
  const target = initial.find(user => user.email === email('target'))
  expect(target).toMatchObject({ is_staff: false, is_superuser: false })
  await page.goto(`${baseURL}/admin/users`)
  await expect(page.getByRole('table', { name: 'Usuarios', exact: true })).toBeVisible()
  await page.getByLabel('Buscar usuarios', { exact: true }).fill(email('target'))
  const search = page.waitForResponse(response =>
    response.url().includes('/api/v1/admin/users?search=') && response.request().method() === 'GET')
  await page.getByRole('button', { name: 'Buscar', exact: true }).click()
  expect((await search).status()).toBe(200)
  await page.getByRole('button', { name: `Seleccionar ${email('target')}`, exact: true }).click()

  // Both enabling and disabling each flag must preserve the other saved flag.
  for (const change of [
    { flag: 'is_staff', label: 'Personal de administración', enabled: true, staff: true, superuser: false },
    { flag: 'is_superuser', label: 'Superadministrador', enabled: true, staff: true, superuser: true },
    { flag: 'is_staff', label: 'Personal de administración', enabled: false, staff: false, superuser: true },
    { flag: 'is_superuser', label: 'Superadministrador', enabled: false, staff: false, superuser: false },
  ]) {
    await page.getByRole('checkbox', { name: change.label, exact: true }).setChecked(change.enabled)
    const pending = page.waitForResponse(response =>
      response.url().endsWith(`/admin/users/${target!.id}/privileges`) && response.request().method() === 'PATCH')
    await page.getByRole('button', { name: 'Guardar cambios', exact: true }).click()
    const response = await pending
    expect(response.status()).toBe(200)
    expect(response.request().postDataJSON()).toEqual({ privilege: change.flag, enabled: change.enabled })
    const saved = await response.json() as Record<string, unknown>
    safeUser(saved)
    expect(saved).toMatchObject({ is_staff: change.staff, is_superuser: change.superuser })
    await expect(page.getByRole('button', { name: 'Guardar cambios', exact: true })).toBeDisabled()
    const persisted = (await list(request, token)).find(user => user.id === target!.id)
    expect(persisted).toMatchObject({ is_staff: change.staff, is_superuser: change.superuser })
  }
  expect((await page.locator('body').innerText()).includes(password)).toBe(false)
})

test('staff receives REST 403, sees no personnel data, and retains an operations page', async ({ page, request, baseURL }) => {
  const token = await login(page, baseURL!, 'staff')
  const response = await request.get(`${bff}/api/v1/admin/users`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  expect(response.status()).toBe(403)
  expect(Object.keys(await response.json())).toEqual(['error'])
  const denied = page.waitForResponse(result =>
    result.url().endsWith('/api/v1/admin/users') && result.request().method() === 'GET')
  await page.goto(`${baseURL}/admin/users`)
  expect((await denied).status()).toBe(403)
  await expect(page.getByRole('alert')).toContainText('No tenés autorización')
  await expect(page.getByRole('table', { name: 'Usuarios', exact: true })).toHaveCount(0)
  await expect(page.getByRole('checkbox')).toHaveCount(0)
  expect((await page.locator('body').innerText()).includes(email('target'))).toBe(false)
  expect((await page.locator('body').innerText()).includes(email('superadmin'))).toBe(false)
  await page.goto(`${baseURL}/admin/gift-cards`)
  await expect(page.getByRole('heading', { name: 'Generar gift card', exact: true })).toBeVisible()
  await expect(page.getByLabel('Importe (ARS)', { exact: true })).toBeVisible()
  // Invalid input checks the existing operational guard without issuing a card.
  const operation = await request.post(`${bff}/api/v1/admin/gift-cards`, {
    headers: { Authorization: `Bearer ${token}` }, data: {},
  })
  expect(operation.status()).toBe(400)
})

test('self-demotion denies the next personnel request using the identical bearer', async ({ page, request, baseURL }) => {
  const token = await login(page, baseURL!, 'selfdemoter')
  const users = await list(request, token)
  const caller = users.find(user => user.email === email('selfdemoter'))!
  expect(users.some(user => user.id !== caller.id && user.is_active === true && user.is_superuser === true)).toBe(true)
  const headers = { Authorization: `Bearer ${token}` }
  const demotion = await request.patch(`${bff}/api/v1/admin/users/${caller.id}/privileges`, {
    headers, data: { privilege: 'is_superuser', enabled: false },
  })
  expect(demotion.status()).toBe(200)
  const saved = await demotion.json() as Record<string, unknown>
  safeUser(saved)
  expect(saved).toMatchObject({ is_staff: false, is_superuser: false })
  const next = await request.get(`${bff}/api/v1/admin/users`, { headers })
  expect(next.status()).toBe(403)
  expect(Object.keys(await next.json())).toEqual(['error'])
  const unchanged = await page.evaluate(() =>
    JSON.parse(sessionStorage.getItem('bgg-shop.session') ?? '{}').access_token as string | undefined)
  expect(unchanged === token, 'The same browser bearer remains unchanged after self-demotion').toBe(true)
})

for (const scenario of [
  { name: 'missing auth', status: 401 },
  { name: 'invalid bearer', status: 401 },
  { name: 'operation-key-only', status: 403 },
  { name: 'inactive valid bearer', status: 403 },
]) {
  test(`${scenario.name} denies listing and mutation without a partial write`, async ({ page, request, baseURL }) => {
    const observer = await login(page, baseURL!, 'superadmin')
    const before = await list(request, observer)
    const target = before.find(user => user.email === email('target'))!
    const headers: Record<string, string> = {}
    if (scenario.name === 'invalid bearer') headers.Authorization = 'Bearer invalid-synthetic-token'
    if (scenario.name === 'operation-key-only') headers['X-Op-Key'] = 'fake-spec012-key'
    if (scenario.name === 'inactive valid bearer') {
      const token = process.env.E2E_SPEC012_INACTIVE_TOKEN ?? ''
      expect(Boolean(token), 'The isolated Core seed must supply an inactive bearer').toBe(true)
      headers.Authorization = `Bearer ${token}`
      expect(before.some(user =>
        user.email === email('inactive') && user.is_active === false && user.is_superuser === true)).toBe(true)
    }
    await authorizationDenied(await request.get(`${bff}/api/v1/admin/users`, { headers }), scenario.status)
    for (const privilege of ['is_staff', 'is_superuser']) {
      await authorizationDenied(await request.patch(`${bff}/api/v1/admin/users/${target.id}/privileges`, {
        headers, data: { privilege, enabled: !target[privilege] },
      }), scenario.status)
    }
    expect(await list(request, observer)).toEqual(before)
  })
}

test('last active Superadmin receives 409 and preserves every saved flag', async ({ page, request, baseURL }) => {
  const token = await login(page, baseURL!, 'solo')
  const headers = { Authorization: `Bearer ${token}` }
  const initial = await list(request, token)
  const caller = initial.find(user => user.email === email('solo'))!
  expect(caller).toMatchObject({ is_active: true, is_staff: false, is_superuser: true })
  expect(initial.some(user =>
    user.email === email('inactive') && user.is_active === false && user.is_superuser === true)).toBe(true)
  const demoted: unknown[] = []
  try {
    for (const user of initial.filter(user =>
      user.id !== caller.id && user.is_active === true && user.is_superuser === true)) {
      const response = await request.patch(`${bff}/api/v1/admin/users/${user.id}/privileges`, {
        headers, data: { privilege: 'is_superuser', enabled: false },
      })
      expect(response.status()).toBe(200)
      demoted.push(user.id)
    }
    const before = await list(request, token)
    expect(before.filter(user => user.is_active === true && user.is_superuser === true).length).toBe(1)
    const denied = await request.patch(`${bff}/api/v1/admin/users/${caller.id}/privileges`, {
      headers, data: { privilege: 'is_superuser', enabled: false },
    })
    expect(denied.status()).toBe(409)
    expect(denied.headers()['cache-control']).toBe('no-store')
    expect(await denied.json()).toEqual({
      errors: [{ code: 'LAST_ACTIVE_SUPERUSER', message: 'At least one active Superadmin must remain.' }],
    })
    expect(await list(request, token)).toEqual(before)
  } finally {
    // Restore only successful setup changes, even when an invariant assertion fails.
    for (const id of demoted) {
      const restored = await request.patch(`${bff}/api/v1/admin/users/${id}/privileges`, {
        headers, data: { privilege: 'is_superuser', enabled: true },
      })
      expect(restored.status()).toBe(200)
    }
    expect(await list(request, token)).toEqual(initial)
  }
})
