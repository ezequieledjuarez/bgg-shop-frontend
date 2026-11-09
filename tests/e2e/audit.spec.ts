import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import {
  createSyntheticProduct,
  expectOpKeyOnly,
  loginAsIsolatedAdmin,
  requireIsolatedOpKeyEnvironment,
} from './utils/opkey'

test('Admin: filter audit history and traverse its cursor pages', async ({ page, baseURL }) => {
  const { apiBaseUrl } = requireIsolatedOpKeyEnvironment(baseURL)
  const operationKey = await loginAsIsolatedAdmin(page, baseURL)

  const productName = `E2E Spec 007 audited product ${randomUUID()}`
  const { id: productId } = await createSyntheticProduct(page, baseURL, {
    name: productName,
    price: '12.00',
    quantity: '2',
  })
  await page.goto(new URL(`/admin/productos/${productId}`, baseURL ?? '').toString())
  await page.getByLabel('Nombre', { exact: true }).fill(`${productName} updated`)
  const updatePromise = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v1/admin/products/${productId}`)
      && response.request().method() === 'PUT',
  )
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  const updateResponse = await updatePromise
  expect(updateResponse.status()).toBe(200)
  expectOpKeyOnly(updateResponse)
  await page.waitForURL(new URL('/admin/productos', baseURL ?? '').toString())

  const initialAuditPromise = page.waitForResponse((response) =>
    response.url().includes('/api/v1/admin/audit?')
      && response.request().method() === 'GET',
  )
  await page.goto(new URL('/admin/auditoria', baseURL ?? '').toString())
  const initialAudit = await initialAuditPromise
  expect(initialAudit.status()).toBe(200)
  expectOpKeyOnly(initialAudit)

  await page.getByLabel('ID de entidad', { exact: true }).fill(String(productId))
  const filteredAuditPromise = page.waitForResponse((response) =>
    response.url().includes(`/api/v1/admin/audit?`)
      && new URL(response.url()).searchParams.get('entity_id') === String(productId)
      && response.request().method() === 'GET',
  )
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  const filteredAudit = await filteredAuditPromise
  expect(filteredAudit.status()).toBe(200)
  expectOpKeyOnly(filteredAudit)
  const auditTable = page.getByRole('table', { name: 'Registros de auditoría' })
  await expect(auditTable.getByRole('row')).toHaveCount(3)
  await expect(auditTable).toContainText(`product_boardgame / ${productId}`)
  await expect(auditTable).toContainText('product_created')
  await expect(auditTable).toContainText('product_updated')

  const firstUrl = new URL(`${apiBaseUrl}/admin/audit`)
  firstUrl.searchParams.set('entity_type', 'product_boardgame')
  firstUrl.searchParams.set('entity_id', String(productId))
  firstUrl.searchParams.set('limit', '1')
  const firstPageResponse = await page.request.get(firstUrl.toString(), {
    headers: { 'X-Op-Key': operationKey },
  })
  expect(firstPageResponse.status()).toBe(200)
  const firstPage = await firstPageResponse.json() as {
    items: Array<{ id: number }>
    next_cursor: string | null
  }
  expect(firstPage.items).toHaveLength(1)
  expect(firstPage.next_cursor).toBeTruthy()

  const secondUrl = new URL(firstUrl)
  secondUrl.searchParams.set('cursor', firstPage.next_cursor!)
  const secondPageResponse = await page.request.get(secondUrl.toString(), {
    headers: { 'X-Op-Key': operationKey },
  })
  expect(secondPageResponse.status()).toBe(200)
  const secondPage = await secondPageResponse.json() as {
    items: Array<{ id: number }>
    next_cursor: string | null
  }
  expect(secondPage.items).toHaveLength(1)
  expect(secondPage.items[0].id).not.toBe(firstPage.items[0].id)
})
