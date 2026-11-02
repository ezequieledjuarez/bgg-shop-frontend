import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import {
  createSyntheticProduct,
  expectOpKeyOnly,
  loginAsIsolatedAdmin,
  requireIsolatedOpKeyEnvironment,
} from './utils/opkey'

test('Admin: edit product without changing quantity or its image reference', async ({ page, baseURL }) => {
  requireIsolatedOpKeyEnvironment(baseURL)
  await loginAsIsolatedAdmin(page, baseURL)

  const productName = `E2E Spec 007 editable product ${randomUUID()}`
  const { id, imageUrl } = await createSyntheticProduct(page, baseURL, {
    name: productName,
    price: '9.99',
    quantity: '3',
  })
  const initialReadBackPromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v1/admin/products/${id}`)
      && response.request().method() === 'GET',
  )
  await page.goto(new URL(`/admin/products/${id}`, baseURL ?? '').toString())
  const initialReadBack = await initialReadBackPromise
  expect(initialReadBack.status()).toBe(200)
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(productName)
  await expect(page.getByText('Existencias actuales: 3', { exact: true })).toBeVisible()
  await expect(page.getByLabel('URL de imagen (.webp)', { exact: true })).toHaveValue(imageUrl)

  const updatedName = `${productName} updated`
  await page.getByLabel('Nombre', { exact: true }).fill(updatedName)
  const updateResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v1/admin/products/${id}`)
      && response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  const updateResponse = await updateResponsePromise
  expect(updateResponse.status()).toBe(200)
  expectOpKeyOnly(updateResponse)
  const changes = updateResponse.request().postDataJSON() as Record<string, unknown>
  expect(changes.name).toBe(updatedName)
  expect(changes).not.toHaveProperty('quantity')

  await page.waitForURL(new URL('/admin/products', baseURL ?? '').toString())
  const readBackPromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v1/admin/products/${id}`)
      && response.request().method() === 'GET',
  )
  await page.goto(new URL(`/admin/products/${id}`, baseURL ?? '').toString())
  const readBack = await readBackPromise
  expect(readBack.status()).toBe(200)
  expectOpKeyOnly(readBack)
  await expect(page.getByLabel('Nombre', { exact: true })).toHaveValue(updatedName)
  await expect(page.getByText('Existencias actuales: 3', { exact: true })).toBeVisible()
  await expect(page.getByLabel('URL de imagen (.webp)', { exact: true })).toHaveValue(imageUrl)
})
