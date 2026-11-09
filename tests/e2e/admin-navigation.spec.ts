import { expect, test } from '@playwright/test'

async function mockRole(page: import('@playwright/test').Page, capabilities: { is_staff: boolean; is_superuser: boolean }) {
  let currentUserRequests = 0
  await page.route('https://**/*', (route) => route.abort())
  await page.route('**/api/v1/auth/me', (route) => {
    currentUserRequests += 1
    return route.fulfill({
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      contentType: 'application/json',
      body: JSON.stringify(capabilities),
    })
  })
  await page.route('**/api/v1/admin/**', (route) => route.fulfill({
    status: 403,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Solicitud sintética no autorizada.' }),
  }))
  return () => currentUserRequests
}

test('staff-only direct Users paths remain forbidden without requesting personnel data', async ({ page }) => {
  let personnelRequests = 0
  const capabilityRequests = await mockRole(page, { is_staff: true, is_superuser: false })
  page.on('request', (request) => {
    if (new URL(request.url()).pathname.includes('/api/v1/admin/users')) personnelRequests += 1
  })
  await page.addInitScript(() => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'synthetic-staff-bearer' }))
  })

  await page.goto('/admin/users/permissions')

  await expect(page.getByRole('heading', { name: 'Acceso restringido' })).toBeVisible()
  const navigation = page.getByRole('navigation', { name: 'Navegación de administración' })
  await expect(navigation).toBeVisible()
  await expect(navigation.getByRole('link', { name: 'Usuarios' })).toHaveCount(0)
  expect(personnelRequests).toBe(0)
  expect(capabilityRequests()).toBe(1)
})

test('a superuser without staff still receives the complete operational navigation', async ({ page }) => {
  const capabilityRequests = await mockRole(page, { is_staff: false, is_superuser: true })
  await page.addInitScript(() => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'synthetic-superuser-bearer' }))
  })

  await page.goto('/admin')

  const navigation = page.getByRole('navigation', { name: 'Navegación de administración' })
  await expect(navigation.getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/admin/users')
  for (const label of ['Productos', 'Promociones', 'Cupones', 'Gift cards', 'Historial de auditoría', 'Ventas', 'Reseñas']) {
    await expect(navigation.getByRole('link', { name: label })).toBeVisible()
  }
  expect(capabilityRequests()).toBe(1)
})
