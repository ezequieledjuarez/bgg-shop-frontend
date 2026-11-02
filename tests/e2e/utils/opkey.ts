import { randomUUID } from 'node:crypto'
import { expect, type Page, type Response as PlaywrightResponse } from '@playwright/test'

export interface IsolatedAdminCredentials {
  email: string
  password: string
  apiBaseUrl: string
}

export interface SyntheticProduct {
  id: number
  imageUrl: string
}

export function requireIsolatedOpKeyEnvironment(baseURL: string | undefined): IsolatedAdminCredentials {
  expect(process.env.E2E_OPKEY_ISOLATED).toBe('true')
  expect(process.env.E2E_OPKEY_DISPOSABLE).toBe('true')
  expect(process.env.VITE_USE_OPKEY).toBe('true')

  const frontend = new URL(baseURL ?? '')
  expect(['localhost', '127.0.0.1']).toContain(frontend.hostname)
  expect(frontend.port).toBe('13008')

  const apiBaseUrl = process.env.VITE_API_BASE_URL ?? `${frontend.origin}/api/v1`
  const apiBase = new URL(apiBaseUrl)
  expect(apiBase.origin).toBe(frontend.origin)
  expect(apiBase.pathname.replace(/\/$/, '')).toBe('/api/v1')

  const apiTarget = new URL(process.env.PW_API_TARGET ?? frontend.origin)
  expect(apiTarget.origin).toBe(frontend.origin)

  const email = process.env.E2E_OPKEY_EMAIL
  const password = process.env.E2E_OPKEY_PASSWORD
  expect(email).toBeTruthy()
  expect(password).toBeTruthy()

  return { email: email!, password: password!, apiBaseUrl }
}

export async function loginAsIsolatedAdmin(
  page: Page,
  baseURL: string | undefined,
): Promise<string> {
  const { email, password } = requireIsolatedOpKeyEnvironment(baseURL)
  const frontendUrl = new URL(baseURL ?? '')
  await page.goto(new URL('/login', frontendUrl).toString())
  await page.getByLabel('Correo electrónico', { exact: true }).fill(email)
  await page.getByLabel('Contraseña', { exact: true }).fill(password)

  const loginResponsePromise = page.waitForResponse((response) =>
    response.url() === `${frontendUrl.origin}/api/v1/auth/login`
      && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  const loginResponse = await loginResponsePromise
  expect(loginResponse.status()).toBe(200)
  await page.waitForURL(new URL('/', frontendUrl).toString())

  const operationKey = await page.evaluate(() => {
    try {
      return JSON.parse(sessionStorage.getItem('bgg-shop.session') ?? '{}').op_key as string | undefined
    } catch {
      return undefined
    }
  })
  expect(operationKey).toBeTruthy()
  return operationKey!
}

export function expectOpKeyOnly(response: PlaywrightResponse): void {
  const headers = response.request().headers()
  expect(headers['x-op-key']).toBeTruthy()
  expect(headers.authorization).toBeUndefined()
}

export async function createSyntheticProduct(
  page: Page,
  baseURL: string | undefined,
  fields: { name: string; price: string; quantity: string },
): Promise<SyntheticProduct> {
  requireIsolatedOpKeyEnvironment(baseURL)
  const imageUrl = `/media/e2e/${randomUUID()}.webp`
  await page.goto(new URL('/admin/products/new', baseURL ?? '').toString())
  await page.getByLabel('Nombre', { exact: true }).fill(fields.name)
  await page.getByLabel('Precio', { exact: true }).fill(fields.price)
  await page.getByLabel('Cantidad', { exact: true }).fill(fields.quantity)
  await page.getByLabel('Año', { exact: true }).fill('2023')
  await page.getByLabel('Tiempo (min)', { exact: true }).fill('60')
  await page.getByLabel('URL de imagen (.webp)', { exact: true }).fill(imageUrl)

  const createResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/admin/products')
      && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.status()).toBe(201)
  expectOpKeyOnly(createResponse)
  const submittedProduct = createResponse.request().postDataJSON() as Record<string, unknown>
  expect(submittedProduct.image_url).toBe(imageUrl)
  expect(submittedProduct.image_file_name).toBeUndefined()
  await page.waitForURL(new URL('/admin/products', baseURL ?? '').toString())
  await page.getByRole('searchbox', { name: 'Buscar por nombre o editorial', exact: true }).fill(fields.name)
  const searchResponsePromise = page.waitForResponse((response) =>
    response.url().includes('/api/v1/admin/products?')
      && response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  const searchResponse = await searchResponsePromise
  expect(searchResponse.status()).toBe(200)
  const productRow = page.getByRole('row').filter({ hasText: fields.name })
  await expect(productRow).toBeVisible()
  const editHref = await productRow.getByRole('link', { name: 'Editar', exact: true }).getAttribute('href')
  const idMatch = editHref?.match(/^\/admin\/products\/(\d+)$/)
  expect(idMatch).not.toBeNull()
  const id = Number(idMatch?.[1])
  expect(Number.isSafeInteger(id)).toBe(true)
  expect(id).toBeGreaterThan(0)
  return { id, imageUrl }
}
