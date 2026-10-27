import { test, expect } from '@playwright/test'

test.describe('Admin flows', () => {
  test('navigate to admin products and open create form', async ({ page, baseURL }) => {
    await page.goto(`${baseURL}/admin/products`)
    await expect(page.locator('h1')).toHaveText(/Productos/i)
    await page.click('a:has-text("Crear producto")')
    await expect(page).toHaveURL(/\/admin\/products\/new/)
    await expect(page.locator('h1')).toHaveText(/Crear producto|Editar producto/i)
  })
})
