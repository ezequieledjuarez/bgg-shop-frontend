import { test, expect } from '@playwright/test'
import {
  expectOpKeyOnly,
  loginAsIsolatedAdmin,
  requireIsolatedOpKeyEnvironment,
} from './utils/opkey'

test.describe('Admin flows', () => {
  test('navigate to admin products and open create form', async ({ page, baseURL }) => {
    requireIsolatedOpKeyEnvironment(baseURL)
    await loginAsIsolatedAdmin(page, baseURL)
    await page.goto(`${baseURL}/admin/productos`)
    await expect(page.locator('h1')).toHaveText(/Productos/i)
    await page.getByRole('link', { name: 'Crear producto', exact: true }).click()
    await expect(page).toHaveURL(/\/admin\/products\/new/)
    await expect(page.locator('h1')).toHaveText(/Crear producto|Editar producto/i)
  })

  test('OpKey login, admin access, and logout', async ({ page, baseURL }) => {
    const { apiBaseUrl } = requireIsolatedOpKeyEnvironment(baseURL)
    await page.goto(`${baseURL}/iniciar-sesion`)
    await page.getByLabel('Correo electrónico', { exact: true }).fill(process.env.E2E_OPKEY_EMAIL!)
    await page.getByLabel('Contraseña', { exact: true }).fill(process.env.E2E_OPKEY_PASSWORD!)
    const loginResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/login') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
    const login = await loginResponse
    expect(login.status()).toBe(200)
    await page.waitForURL(`${baseURL}/`)
    const operationKey = await page.evaluate(() => JSON.parse(sessionStorage.getItem('bgg-shop.session') ?? '{}').op_key as string | undefined)
    expect(operationKey).toBeTruthy()

    const adminResponse = page.waitForResponse(response => response.url().includes('/api/v1/admin/products?') && response.request().method() === 'GET')
    await page.goto(`${baseURL}/admin/productos`)
    const admin = await adminResponse
    expect(admin.status()).toBe(200)
    expectOpKeyOnly(admin)
    await expect(page.getByRole('table', { name: 'Productos' })).toBeVisible()

    await page.goto(`${baseURL}/`)
    const logoutResponse = page.waitForResponse(response => response.url().endsWith('/api/v1/auth/logout') && response.request().method() === 'POST')
    await page.getByRole('button', { name: 'Cerrar sesión' }).click()
    const logout = await logoutResponse
    expect(logout.status()).toBe(204)
    expectOpKeyOnly(logout)
    await expect(page.getByRole('link', { name: 'Iniciar sesión' })).toBeVisible()
    expect(await page.evaluate(() => sessionStorage.getItem('bgg-shop.session'))).toBeNull()

    const rejectedStatus = await page.evaluate(async ({ key, url }) => {
      const response = await fetch(`${url}/admin/products?page=1&page_size=1`, {
        headers: { 'X-Op-Key': key! },
      })
      return response.status
    }, { key: operationKey, url: apiBaseUrl })
    expect(rejectedStatus).toBe(401)
  })
})
