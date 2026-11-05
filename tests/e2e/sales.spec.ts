import { test, expect } from '@playwright/test'
import type { components } from '../../src/types/generated/bff-api'
import { expectOpKeyOnly, loginAsIsolatedAdmin, requireIsolatedOpKeyEnvironment } from './utils/opkey'

type SalesMetrics = components['schemas']['AdminSalesMetrics']

const formatCurrency = (value: number) => new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
}).format(value)

test('Admin: filter sales metrics and render the filtered BFF response', async ({ page, baseURL }) => {
  requireIsolatedOpKeyEnvironment(baseURL)
  const salesProductId = process.env.E2E_SALES_PRODUCT_ID
  expect(salesProductId).toMatch(/^[1-9]\d*$/)
  const salesProductIdNumber = Number(salesProductId)
  expect(Number.isSafeInteger(salesProductIdNumber)).toBe(true)
  expect(salesProductIdNumber).toBeLessThanOrEqual(2147483647)
  const salesProductName = `OpKey E2E Sales ${salesProductId}`
  await loginAsIsolatedAdmin(page, baseURL)

  const defaultMetricsPromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname.endsWith('/api/v1/admin/sales-metrics')
      && response.request().method() === 'GET'
  })
  await page.goto(new URL('/admin/sales', baseURL ?? '').toString())
  const defaultMetricsResponse = await defaultMetricsPromise
  expect(defaultMetricsResponse.status()).toBe(200)
  expectOpKeyOnly(defaultMetricsResponse)
  expect(new URL(defaultMetricsResponse.url()).searchParams.has('from')).toBe(false)
  expect(new URL(defaultMetricsResponse.url()).searchParams.has('to')).toBe(false)
  await expect(page.getByRole('heading', { name: 'Métricas de ventas' })).toBeVisible()

  const filteredMetricsPromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname.endsWith('/api/v1/admin/sales-metrics')
      && url.searchParams.get('product_id') === salesProductId
      && response.request().method() === 'GET'
  })
  await page.getByLabel('ID del producto', { exact: true }).fill(salesProductId!)
  await page.getByRole('button', { name: 'Aplicar filtros', exact: true }).click()
  const filteredMetricsResponse = await filteredMetricsPromise
  expect(filteredMetricsResponse.status()).toBe(200)
  expectOpKeyOnly(filteredMetricsResponse)

  const metrics = await filteredMetricsResponse.json() as SalesMetrics
  expect(metrics.revenue_total).toBe(25.5)
  expect(metrics.orders_count).toBe(1)
  expect(metrics.top_products).toEqual([
    expect.objectContaining({
      bgg_id: salesProductIdNumber,
      name: salesProductName,
      units: 2,
      revenue: 25.5,
    }),
  ])
  expect(metrics.orders_by_payment_status).toEqual([
    { status: 'approved', count: 1 },
  ])
  expect(metrics.orders_by_dispatch_status).toEqual([
    { status: 'En preparación', count: 1 },
  ])

  const summary = page.getByRole('region', { name: 'Resumen de ventas' })
  await expect(summary.getByText(formatCurrency(25.5), { exact: true })).toBeVisible()
  await expect(summary.getByText('1', { exact: true })).toBeVisible()

  const dispatchStatus = page.getByRole('region', { name: 'Estado de despacho' })
  await expect(dispatchStatus.getByText('En preparación', { exact: true })).toBeVisible()
  await expect(dispatchStatus.getByText('1 orden', { exact: true })).toBeVisible()

  const paymentStatus = page.getByRole('region', { name: 'Estado de pago' })
  await expect(paymentStatus.getByText('approved', { exact: true })).toBeVisible()
  await expect(paymentStatus.getByText('1 orden', { exact: true })).toBeVisible()

  const productTable = page.getByRole('table', { name: 'Productos más vendidos' })
  const productRow = productTable.getByRole('row', { name: new RegExp(salesProductName) })
  await expect(productRow).toContainText(salesProductName)
  await expect(productRow).toContainText(String(salesProductIdNumber))
  await expect(productRow).toContainText('2')
  await expect(productRow).toContainText(`ARS ${formatCurrency(25.5)}`)
})