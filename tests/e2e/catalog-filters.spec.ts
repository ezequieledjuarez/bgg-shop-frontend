import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import type { components } from '../../src/types/generated/bff-api'

type ProductPage = components['schemas']['ProductPage']
const apiBaseUrl = process.env.CATALOG_E2E_API_BASE_URL ?? 'http://localhost:5000/api/v1'

test.use({ storageState: { cookies: [], origins: [] } })

async function waitForProducts(page: Page, expected: Record<string, string>, action: () => Promise<unknown>) {
  const responsePromise = page.waitForResponse((response) => {
    const url = new URL(response.url())
    return url.pathname === '/api/v1/products' &&
      Object.entries(expected).every(([key, value]) => url.searchParams.get(key) === value)
  })
  await action()
  const response = await responsePromise
  expect(response.ok()).toBe(true)
  const result = await response.json() as ProductPage
  await expect(page.locator('.product-card h3')).toHaveText(result.items.map((item) => item.name))
  return result
}

test('combines search, category, year, player and price filters against the local services', async ({ page, request }) => {
  const initial = await request.get(`${apiBaseUrl}/products?page=1&page_size=100`)
  expect(initial.ok()).toBe(true)
  const catalog = await initial.json() as ProductPage
  const product = catalog.items.find((item) => item.category.length > 0 && item.release_year > 1900 &&
    item.min_players >= 1 && item.max_players >= item.min_players && Number.isFinite(item.price) && item.price >= 0)
  expect(product, 'The local catalog needs one product with complete filter data').toBeDefined()
  if (!product) return

  await page.goto('/')
  const category = page.getByRole('combobox', { name: 'Categoría' })
  await expect(category.getByRole('option', { name: product.category[0], exact: true })).toBeAttached()
  const filters: Record<string, string> = { page: '1', category_name: product.category[0] }
  await waitForProducts(page, filters, () => category.selectOption({ label: product.category[0] }))
  filters.year_published = String(product.release_year)
  await waitForProducts(page, filters, () => page.getByLabel('Año de publicación').fill(filters.year_published))
  filters.min_players = String(product.min_players)
  await waitForProducts(page, filters, () => page.getByLabel('Mínimo de jugadores').fill(filters.min_players))
  filters.max_players = String(product.max_players)
  await waitForProducts(page, filters, () => page.getByLabel('Máximo de jugadores').fill(filters.max_players))
  filters.price_min = String(product.price)
  await waitForProducts(page, filters, () => page.getByLabel('Precio mínimo').fill(filters.price_min))
  filters.price_max = String(product.price)
  await waitForProducts(page, filters, () => page.getByLabel('Precio máximo').fill(filters.price_max))
  await page.getByRole('searchbox', { name: /nombre o editorial/i }).fill(product.name)
  filters.search = product.name
  const result = await waitForProducts(page, filters, () => page.getByRole('button', { name: 'Buscar', exact: true }).click())

  expect(result.items.some((item) => item.bgg_id === product.bgg_id)).toBe(true)
  for (const item of result.items) {
    expect(item.category).toContain(product.category[0])
    expect(item.release_year).toBe(product.release_year)
    expect(item.max_players).toBeGreaterThanOrEqual(product.min_players)
    expect(item.min_players).toBeLessThanOrEqual(product.max_players)
    expect(item.price).toBe(product.price)
    expect(`${item.name} ${item.publisher}`.toLocaleLowerCase()).toContain(product.name.toLocaleLowerCase())
  }
})

test('navigates catalog pages and resets to page one when applying a filter', async ({ page, request }) => {
  const initial = await request.get(`${apiBaseUrl}/products?page=1&page_size=100`)
  expect(initial.ok()).toBe(true)
  const catalog = await initial.json() as ProductPage
  expect(catalog.total_pages, 'The local catalog needs more than one page').toBeGreaterThan(1)
  const product = catalog.items.find((item) => item.category.length > 0)
  expect(product).toBeDefined()
  if (!product) return

  await page.goto('/')
  await expect(page.getByText(`Página 1 de ${catalog.total_pages}`)).toBeVisible()
  await expect(page.getByText(`${catalog.total} resultados`, { exact: true })).toBeVisible()
  await waitForProducts(page, { page: '2' }, () => page.getByRole('button', { name: 'Página siguiente' }).click())
  await expect(page.getByText(`Página 2 de ${catalog.total_pages}`)).toBeVisible()
  await waitForProducts(page, { page: '1' }, () => page.getByRole('button', { name: 'Página anterior' }).click())
  await waitForProducts(page, { page: '2' }, () => page.getByRole('button', { name: 'Página siguiente' }).click())
  const category = page.getByRole('combobox', { name: 'Categoría' })
  await expect(category.getByRole('option', { name: product.category[0], exact: true })).toBeAttached()
  const filtered = await waitForProducts(page, { page: '1', category_name: product.category[0] }, () => category.selectOption({ label: product.category[0] }))
  if (filtered.total_pages > 1) {
    await expect(page.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
  } else {
    await expect(page.getByRole('navigation', { name: 'Páginas del catálogo' })).toHaveCount(0)
  }
})

test('combines category and an empty search result, then clears the filters', async ({ page, request }) => {
  const response = await request.get(`${apiBaseUrl}/product-categories`)
  expect(response.ok()).toBe(true)
  const categories = await response.json() as string[]
  expect(categories.length, 'The local catalog needs at least one category').toBeGreaterThan(0)

  await page.goto('/')
  const category = page.getByRole('combobox', { name: 'Categoría' })
  await expect(category.getByRole('option', { name: categories[0], exact: true })).toBeAttached()
  await waitForProducts(page, { category_name: categories[0] }, () => category.selectOption({ label: categories[0] }))
  const search = page.getByRole('searchbox', { name: /nombre o editorial/i })
  await search.fill('zzzz-catalogo-sin-resultados-zzzz')
  const result = await waitForProducts(page, { category_name: categories[0], search: 'zzzz-catalogo-sin-resultados-zzzz' },
    () => page.getByRole('button', { name: 'Buscar', exact: true }).click())
  expect(result.total).toBe(0)
  await expect(page.getByText('No encontramos juegos')).toBeVisible()
  await waitForProducts(page, { page: '1' }, () => page.locator('.filter-panel').getByRole('button', { name: 'Limpiar filtros' }).click())
  await expect(category).toHaveValue('')
  await expect(search).toHaveValue('')
})

test('explains invalid ranges and recovers after correcting them', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('.product-card').first()).toBeVisible()
  await waitForProducts(page, { min_players: '4' }, () => page.getByLabel('Mínimo de jugadores').fill('4'))
  await page.getByLabel('Máximo de jugadores').fill('2')
  await expect(page.getByRole('alert')).toContainText('El mínimo de jugadores no puede superar el máximo.')
  await expect(page.getByLabel('Máximo de jugadores')).toHaveAttribute('aria-invalid', 'true')
  await waitForProducts(page, { min_players: '4', max_players: '4' }, () => page.getByLabel('Máximo de jugadores').fill('4'))
  await waitForProducts(page, { price_min: '100' }, () => page.getByLabel('Precio mínimo').fill('100'))
  await page.getByLabel('Precio máximo').fill('10')
  await expect(page.getByRole('alert')).toContainText('El precio mínimo no puede superar el máximo.')
  await waitForProducts(page, { price_min: '100', price_max: '100' }, () => page.getByLabel('Precio máximo').fill('100'))
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.getByRole('option', { name: 'Recomendados' })).toHaveCount(0)
})