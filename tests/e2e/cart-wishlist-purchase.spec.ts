import { expect, test } from '@playwright/test'
import { readFile } from 'node:fs/promises'

test.use({ storageState: { cookies: [], origins: [] }, screenshot: 'off', video: 'off', trace: 'off' })

test('merges a guest cart and completes a simulated purchase with wishlist cleanup', async ({ page, request, context }) => {
  test.skip(process.env.C04_C06_DISPOSABLE_E2E !== 'true', 'Requires the isolated disposable purchase stack')
  const bff = 'http://127.0.0.1:5001'
  const stackMarker = await request.get(`${bff}/__c04_c06_disposable__`)
  expect(stackMarker.status()).toBe(200)
  expect(await stackMarker.json()).toEqual({ stack: 'c04-c06-disposable', core: '127.0.0.1:8001' })
  for (const [slug, bggId] of [['synthetic-cart-game', 934004], ['synthetic-wishlist-game', 934006]] as const) {
    const marker = await request.get(`${bff}/api/v1/games/${slug}`)
    expect(marker.status()).toBe(200)
    expect((await marker.json()).bgg_id).toBe(bggId)
  }

  let pendingOrder: { id: string; status: string } | undefined
  await page.route('**/*', async (route) => {
    const original = new URL(route.request().url())
    if (original.origin === 'http://localhost:5000' && original.pathname.startsWith('/api/v1/')) {
      const response = await route.fetch({ url: `${bff}${original.pathname}${original.search}` })
      if (original.pathname === '/api/v1/checkout' && route.request().method() === 'POST' && response.ok()) {
        pendingOrder = ((await response.json()) as { order: { id: string; status: string } }).order
      }
      await route.fulfill({ response })
    } else if (original.origin === 'https://www.mercadopago.com' && original.pathname === '/synthetic-payment') {
      await route.fulfill({ status: 200, contentType: 'text/html', body: 'Synthetic payment' })
    } else if (original.origin === 'http://localhost:3000' && !original.pathname.startsWith('/api/')) {
      await route.continue()
    } else {
      await route.abort('blockedbyclient')
    }
  })

  const email = `buyer-${crypto.randomUUID()}@example.test`
  const password = `${crypto.randomUUID()}-Test1!`
  const registration = await request.post(`${bff}/api/v1/auth/register`, {
    data: { email, password, first_name: 'Synthetic', last_name: 'Buyer' },
  })
  expect(registration.status()).toBe(201)

  await page.goto('/')
  await page.getByRole('button', { name: 'Agregar Synthetic Cart Game al carrito' }).click()
  await page.goto('/carrito')
  await expect(page.getByLabel('Cantidad de Synthetic Cart Game', { exact: true })).toHaveValue('1')
  await page.reload()
  await expect(page.getByLabel('Cantidad de Synthetic Cart Game', { exact: true })).toHaveValue('1')
  expect((await context.cookies()).some((cookie) => cookie.name === 'cart_id')).toBe(true)

  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  const loginResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/auth/login')
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  expect((await loginResponse).status()).toBe(200)
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  await page.goto('/carrito')
  await expect(page.getByLabel('Cantidad de Synthetic Cart Game', { exact: true })).toHaveValue('1')
  expect((await context.cookies()).some((cookie) => cookie.name === 'cart_id')).toBe(false)

  for (const slug of ['synthetic-cart-game', 'synthetic-wishlist-game']) {
    await page.goto(`/juegos/${slug}`)
    await page.getByRole('button', { name: 'Guardar en mi lista de deseos' }).click()
    await expect(page.getByRole('button', { name: 'Guardado en mi lista de deseos' })).toBeVisible()
  }
  await page.goto('/wishlist')
  await expect(page.getByRole('listitem', { name: 'Synthetic Cart Game' })).toBeVisible()
  await expect(page.getByRole('listitem', { name: 'Synthetic Wishlist Game' })).toBeVisible()

  await page.goto('/checkout')
  await page.getByLabel('Modalidad de entrega').selectOption('pickup')
  const checkoutResponse = page.waitForResponse((response) => response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/checkout')
  await page.getByRole('button', { name: 'Continuar a Mercado Pago' }).click()
  const checkout = await checkoutResponse
  expect(checkout.status()).toBe(200)
  expect(pendingOrder?.status).toBe('pending_payment')
  await page.waitForURL('https://www.mercadopago.com/synthetic-payment')
  await page.goto(`/compra/resultado?payment_id=synthetic-payment&external_reference=${pendingOrder!.id}`)
  await expect(page.getByRole('heading', { name: '¡Gracias por tu compra!' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Descargar factura' }).click()
  const download = await downloadPromise
  expect((await readFile(await download.path())).subarray(0, 5).toString()).toBe('%PDF-')

  await page.goto('/carrito')
  await expect(page.getByText('Tu carrito está vacío.')).toBeVisible()
  await page.goto('/wishlist')
  await expect(page.getByRole('listitem', { name: 'Synthetic Cart Game' })).toHaveCount(0)
  await expect(page.getByRole('listitem', { name: 'Synthetic Wishlist Game' })).toBeVisible()

  if (process.env.C05_DUPLICATE_PAYMENT_E2E === 'true') {
    const secondConfirmation = page.waitForResponse((response) =>
      response.request().method() === 'POST' && new URL(response.url()).pathname === '/api/v1/checkout/confirm')
    await page.goto(`/compra/resultado?payment_id=synthetic-second-payment&external_reference=${pendingOrder!.id}`)
    const secondResponse = await secondConfirmation
    expect([200, 409]).toContain(secondResponse.status())
    if (secondResponse.status() === 200) {
      expect((await secondResponse.json()).order.status).toBe('paid')
      await expect(page.getByRole('heading', { name: '¡Gracias por tu compra!' })).toBeVisible()
    }
    expect(secondResponse.status()).toBe(409)
    expect((await secondResponse.json()).errors[0].code).toBe('PAYMENT_REQUIRES_REVIEW')
    await expect(page.getByRole('alert')).toContainText('Tu pago requiere revisión')
  }
})