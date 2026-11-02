import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import {
  createSyntheticProduct,
  expectOpKeyOnly,
  loginAsIsolatedAdmin,
  requireIsolatedOpKeyEnvironment,
} from './utils/opkey'

test('Admin: create product with one WebP reference and read it back', async ({ page, baseURL }) => {
  requireIsolatedOpKeyEnvironment(baseURL)
  await loginAsIsolatedAdmin(page, baseURL)

  const productName = `E2E Spec 007 product ${randomUUID()}`
  const { id, imageUrl } = await createSyntheticProduct(page, baseURL, {
    name: productName,
    price: '19.99',
    quantity: '5',
  })

  const productResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v1/admin/products/${id}`)
      && response.request().method() === 'GET',
  )
  await page.goto(new URL(`/admin/products/${id}`, baseURL ?? '').toString())
  const productResponse = await productResponsePromise
  expect(productResponse.status()).toBe(200)
  expectOpKeyOnly(productResponse)
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(productName)
  await expect(page.getByText('Existencias actuales: 5', { exact: true })).toBeVisible()
  await expect(page.getByLabel('URL de imagen (.webp)', { exact: true })).toHaveValue(imageUrl)
})
