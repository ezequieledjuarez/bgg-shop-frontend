import { randomUUID } from 'node:crypto'
import { test, expect } from '@playwright/test'
import {
  expectOpKeyOnly,
  loginAsIsolatedAdmin,
  requireIsolatedOpKeyEnvironment,
} from './utils/opkey'

test('Admin: create, list, and edit a coupon with validated discount limits', async ({ page, baseURL }) => {
  requireIsolatedOpKeyEnvironment(baseURL)
  await loginAsIsolatedAdmin(page, baseURL)

  const code = `E2E007${randomUUID().replaceAll('-', '').slice(0, 12).toUpperCase()}`
  await page.goto(new URL('/admin/cupones/nuevo', baseURL ?? '').toString())
  await page.getByLabel('Código', { exact: true }).fill(code)
  await page.getByLabel('Descuento (%)', { exact: true }).fill('51')
  await page.getByLabel('Usos restantes', { exact: true }).fill('4')
  await page.getByLabel('Activo', { exact: true }).check()

  let couponPosts = 0
  page.on('request', (request) => {
    if (request.url().endsWith('/api/v1/admin/coupons') && request.method() === 'POST') couponPosts += 1
  })
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('El descuento debe estar entre 0% y 50%')
  expect(couponPosts).toBe(0)

  await page.getByLabel('Descuento (%)', { exact: true }).fill('15')
  const createResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/admin/coupons')
      && response.request().method() === 'POST',
  )
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  const createResponse = await createResponsePromise
  expect(createResponse.status()).toBe(201)
  expectOpKeyOnly(createResponse)
  expect(createResponse.request().postDataJSON()).toMatchObject({
    code,
    discount_percent: 15,
    remaining: 4,
    active: true,
  })
  await expect(page.getByRole('status')).toContainText('El cupón se guardó correctamente.')

  const listResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/admin/coupons')
      && response.request().method() === 'GET',
  )
  await page.goto(new URL('/admin/cupones', baseURL ?? '').toString())
  const listResponse = await listResponsePromise
  expect(listResponse.status()).toBe(200)
  const couponRow = page.getByRole('row').filter({ hasText: code })
  await expect(couponRow).toContainText('15%')
  await expect(couponRow).toContainText('4')
  await expect(couponRow).toContainText('Activo')
  await couponRow.getByRole('link', { name: 'Editar / activar o desactivar', exact: true }).click()

  await expect(page.getByLabel('Código', { exact: true })).toHaveValue(code)
  await page.getByLabel('Descuento (%)', { exact: true }).fill('20')
  await page.getByLabel('Usos restantes', { exact: true }).fill('3')
  await page.getByLabel('Activo', { exact: true }).uncheck()
  const updateResponsePromise = page.waitForResponse((response) =>
    /\/api\/v1\/admin\/coupons\/\d+$/.test(response.url())
      && response.request().method() === 'PATCH',
  )
  await page.getByRole('button', { name: 'Guardar', exact: true }).click()
  const updateResponse = await updateResponsePromise
  expect(updateResponse.status()).toBe(200)
  expectOpKeyOnly(updateResponse)
  expect(updateResponse.request().postDataJSON()).toMatchObject({
    discount_percent: 20,
    remaining: 3,
    active: false,
  })

  const rereadResponsePromise = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/admin/coupons')
      && response.request().method() === 'GET',
  )
  await page.goto(new URL('/admin/cupones', baseURL ?? '').toString())
  const rereadResponse = await rereadResponsePromise
  expect(rereadResponse.status()).toBe(200)
  const rereadCoupon = page.getByRole('row').filter({ hasText: code })
  await expect(rereadCoupon).toContainText('20%')
  await expect(rereadCoupon).toContainText('3')
  await expect(rereadCoupon).toContainText('Inactivo')
})
