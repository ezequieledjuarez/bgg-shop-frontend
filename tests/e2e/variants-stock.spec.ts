import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import {
  createSyntheticProduct,
  expectOpKeyOnly,
  loginAsIsolatedAdmin,
  requireIsolatedOpKeyEnvironment,
} from './utils/opkey'

test('Admin: adjust product stock through the current inventory form', async ({ page, baseURL }) => {
  requireIsolatedOpKeyEnvironment(baseURL)
  await loginAsIsolatedAdmin(page, baseURL)

  const productName = `E2E Spec 007 stock product ${randomUUID()}`
  const { id } = await createSyntheticProduct(page, baseURL, {
    name: productName,
    price: '14.00',
    quantity: '5',
  })
  await page.goto(new URL(`/admin/productos/${id}`, baseURL ?? '').toString())
  await expect(page.getByText('Existencias actuales: 5', { exact: true })).toBeVisible()

  await page.getByLabel('Tipo de movimiento', { exact: true }).selectOption('OUT')
  await page.getByLabel('Cantidad a ajustar', { exact: true }).fill('2')
  const allocationPromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/admin/stock-movement-ids')
      && response.request().method() === 'POST',
  )
  const adjustmentPromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v1/admin/products/${id}/stock`)
      && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Aplicar ajuste', exact: true }).click()
  const allocation = await allocationPromise
  const adjustment = await adjustmentPromise
  expect(allocation.status()).toBe(200)
  expect(adjustment.status()).toBe(200)
  expectOpKeyOnly(allocation)
  expectOpKeyOnly(adjustment)
  expect(adjustment.request().postDataJSON()).toMatchObject({
    direction: 'OUT',
    quantity: 2,
  })

  await expect(page.getByRole('status').filter({ hasText: 'Solicitadas: 2. Aplicadas: 2.' }))
    .toContainText('Existencia final: 3.')
  await expect(page.getByText('Existencias actuales: 3', { exact: true })).toBeVisible()

  const readBackPromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v1/admin/products/${id}`)
      && response.request().method() === 'GET',
  )
  await page.reload()
  const readBack = await readBackPromise
  expect(readBack.status()).toBe(200)
  await expect(page.getByText('Existencias actuales: 3', { exact: true })).toBeVisible()
})
