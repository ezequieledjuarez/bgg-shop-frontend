import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import {
  createSyntheticProduct,
  expectOpKeyOnly,
  loginAsIsolatedAdmin,
  requireIsolatedOpKeyEnvironment,
} from './utils/opkey'

test('Admin: create a product-specific promotion and verify its price preview', async ({ page, baseURL }) => {
  requireIsolatedOpKeyEnvironment(baseURL)
  await loginAsIsolatedAdmin(page, baseURL)

  const productName = `E2E Spec 007 promotion product ${randomUUID()}`
  const { id: productId } = await createSyntheticProduct(page, baseURL, {
    name: productName,
    price: '100.00',
    quantity: '4',
  })

  await page.goto(new URL('/admin/promotions/new', baseURL ?? '').toString())
  await page.getByLabel('Nombre', { exact: true }).fill(`E2E Spec 007 promotion ${randomUUID()}`)
  await page.getByLabel('Producto', { exact: true }).selectOption(String(productId))
  await page.getByLabel('Descuento (%)', { exact: true }).fill('10')
  await page.getByLabel('Activa', { exact: true }).check()

  const preview = page.getByRole('region', { name: 'Vista previa del precio promocional' })
  await expect(preview.getByRole('status')).toContainText(/90/)

  const promotionName = await page.getByLabel('Nombre', { exact: true }).inputValue()
  const createResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/admin/promotions')
      && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.status()).toBe(201)
  expectOpKeyOnly(createResponse)
  expect(createResponse.request().postDataJSON()).toMatchObject({
    name: promotionName,
    discount_percent: 10,
    product_bgg_id: productId,
    active: true,
  })
  await expect(
    page.getByRole('status').filter({ hasText: 'La promoción se guardó correctamente.' }),
  ).toHaveText('La promoción se guardó correctamente.')

  const listResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/admin/promotions')
      && response.request().method() === 'GET',
  )
  await page.goto(new URL('/admin/promotions', baseURL ?? '').toString())
  const listResponse = await listResponsePromise
  expect(listResponse.status()).toBe(200)
  const promotionRow = page.getByRole('listitem').filter({ hasText: promotionName })
  await expect(promotionRow).toContainText('10% de descuento')
  await expect(promotionRow).toContainText(`Producto #${productId}`)
  await expect(promotionRow).toContainText('Activa')
})

test('Admin: create an inactive global promotion without selecting a product', async ({ page, baseURL }) => {
  requireIsolatedOpKeyEnvironment(baseURL)
  await loginAsIsolatedAdmin(page, baseURL)

  await page.goto(new URL('/admin/promotions/new', baseURL ?? '').toString())
  const promotionName = `E2E Spec 007 global ${randomUUID()}`
  await page.getByLabel('Nombre', { exact: true }).fill(promotionName)
  await expect(page.getByLabel('Producto', { exact: true })).toHaveValue('')
  await page.getByLabel('Descuento (%)', { exact: true }).fill('5')
  await expect(page.getByRole('region', { name: 'Vista previa del precio promocional' })).toHaveCount(0)

  const createResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/admin/promotions')
      && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.status()).toBe(201)
  expectOpKeyOnly(createResponse)
  expect(createResponse.request().postDataJSON()).toEqual({
    name: promotionName,
    discount_percent: 5,
    product_bgg_id: null,
    active: false,
  })
  await expect(page.getByRole('status')).toContainText('La promoción se guardó correctamente.')

  const listResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/admin/promotions')
      && response.request().method() === 'GET',
  )
  await page.goto(new URL('/admin/promotions', baseURL ?? '').toString())
  expect((await listResponsePromise).status()).toBe(200)
  const promotionRow = page.getByRole('listitem').filter({ hasText: promotionName })
  await expect(promotionRow).toContainText('Todos los productos')
  await expect(promotionRow).not.toContainText('Producto #')
})
