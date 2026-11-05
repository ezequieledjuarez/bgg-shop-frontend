import { expect, test } from '@playwright/test'

test.use({ storageState: { cookies: [], origins: [] }, screenshot: 'off', video: 'off', trace: 'off' })

test('opens a real product detail and prevents anonymous review submission', async ({ page }) => {
  let reviewRequests = 0
  page.on('request', (request) => {
    if (request.method() === 'POST' && new URL(request.url()).pathname.endsWith('/reviews')) reviewRequests += 1
  })

  await page.goto('/')
  const product = page.getByRole('article').first()
  await expect(product).toBeVisible()
  const productName = await product.getByRole('heading', { level: 3 }).textContent()
  expect(productName).toBeTruthy()
  const detailResponse = page.waitForResponse((response) =>
    response.request().method() === 'GET' && new URL(response.url()).pathname.includes('/api/v1/games/'))
  await product.getByRole('button', { name: /ver detalles/i }).click()
  expect((await detailResponse).status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(productName!)
  await expect(page.getByRole('heading', { name: 'Reseñas de la comunidad' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Reseña', exact: true }).fill('Synthetic anonymous review')
  await page.getByRole('button', { name: 'Enviar reseña' }).click()
  await expect(page.getByRole('alert')).toContainText('Iniciá sesión para dejar una reseña.')
  expect(reviewRequests).toBe(0)
})

test('shows not-found feedback for a missing product', async ({ page }) => {
  const slug = `missing-review-test-${crypto.randomUUID()}`
  const detailResponse = page.waitForResponse((response) =>
    new URL(response.url()).pathname.endsWith(`/api/v1/games/${slug}`))
  await page.goto(`/juegos/${slug}`)
  expect((await detailResponse).status()).toBe(404)
  await expect(page.getByRole('alert')).toContainText('No encontramos ese juego.')
})

test('submits an authenticated review through an isolated disposable stack', async ({ page, request }) => {
  test.skip(process.env.C03_DISPOSABLE_REVIEW_E2E !== 'true', 'Requires the isolated review test stack')
  const bff = 'http://127.0.0.1:5001'
  const marker = await request.get(`${bff}/api/v1/games/synthetic-review-game`)
  expect(marker.status()).toBe(200)
  const product = await marker.json() as { bgg_id: number; name: string; approved_reviews: unknown[] }
  expect(product).toMatchObject({ bgg_id: 123456, name: 'Synthetic Review Game', approved_reviews: [] })

  const email = `review-${crypto.randomUUID()}@example.test`
  const password = `${crypto.randomUUID()}-Test1!`
  const registration = await request.post(`${bff}/api/v1/auth/register`, {
    data: { email, password, first_name: 'Synthetic', last_name: 'Reviewer' },
  })
  expect(registration.status()).toBe(201)

  await page.route('**/api/v1/**', async (route) => {
    const original = new URL(route.request().url())
    if (original.origin !== 'http://localhost:5000') {
      await route.abort('blockedbyclient')
      throw new Error('Unexpected API origin in isolated review test')
    }
    await route.fulfill({ response: await route.fetch({ url: `${bff}${original.pathname}${original.search}` }) })
  })
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(email)
  await page.getByLabel('Contraseña').fill(password)
  const loginResponse = page.waitForResponse((response) => new URL(response.url()).pathname === '/api/v1/auth/login')
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  expect((await loginResponse).status()).toBe(200)
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()

  await page.goto('/juegos/synthetic-review-game')
  await expect(page.getByRole('heading', { name: 'Synthetic Review Game' })).toBeVisible()
  await page.getByRole('textbox', { name: 'Reseña', exact: true }).fill('Synthetic pending review')
  const reviewResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST' && new URL(response.url()).pathname.endsWith('/reviews'))
  await page.getByRole('button', { name: 'Enviar reseña' }).click()
  const created = await reviewResponse
  expect(created.status()).toBe(201)
  expect(await created.json()).toMatchObject({ created: true, status: 'PENDING' })
  await expect(page.getByText('Tu reseña fue enviada y quedó pendiente de moderación.').first()).toBeVisible()

  const duplicate = await page.evaluate(async () => {
    const session = JSON.parse(sessionStorage.getItem('bgg-shop.session') ?? '{}') as { access_token?: string }
    const response = await fetch('http://localhost:5000/api/v1/games/synthetic-review-game/reviews', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ rating: 5, body: 'Duplicate review' }),
    })
    return { status: response.status, body: await response.json() }
  })
  expect(duplicate.status).toBe(409)
  expect(duplicate.body.errors[0].code).toBe('REVIEW_ALREADY_EXISTS')
  const publicDetail = await request.get(`${bff}/api/v1/games/synthetic-review-game`)
  expect(publicDetail.status()).toBe(200)
  expect((await publicDetail.json()).approved_reviews).toEqual([])
})

test('moderator accepts a pending review and public detail refreshes', async ({ page, request }) => {
  test.skip(process.env.C03_DISPOSABLE_REVIEW_E2E !== 'true', 'Requires the isolated review test stack')
  const bff = 'http://127.0.0.1:5001'
  const buyerEmail = `review-${crypto.randomUUID()}@example.test`
  const buyerPassword = `${crypto.randomUUID()}-Test1!`
  const reviewBody = `Synthetic moderation journey ${crypto.randomUUID()}`

  const marker = await request.get(`${bff}/api/v1/games/synthetic-review-game`)
  expect(marker.status()).toBe(200)
  const baseline = await marker.json() as {
    approved_reviews: Array<{ rating: number; body: string }>
    review_summary: { approved_review_count: number; average_rating: number | null }
  }

  const registration = await request.post(`${bff}/api/v1/auth/register`, {
    data: { email: buyerEmail, password: buyerPassword, first_name: 'Synthetic', last_name: 'Reviewer' },
  })
  expect(registration.status()).toBe(201)

  await page.route('**/api/v1/**', async (route) => {
    const original = new URL(route.request().url())
    if (original.origin !== 'http://localhost:5000') {
      await route.abort('blockedbyclient')
      throw new Error('Unexpected API origin in isolated review test')
    }
    await route.fulfill({ response: await route.fetch({ url: `${bff}${original.pathname}${original.search}` }) })
  })

  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill(buyerEmail)
  await page.getByLabel('Contraseña').fill(buyerPassword)
  const buyerLogin = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/v1/auth/login')
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  expect((await buyerLogin).status()).toBe(200)

  await page.goto('/juegos/synthetic-review-game')
  await page.getByRole('textbox', { name: 'Reseña', exact: true }).fill(reviewBody)
  const reviewResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST'
    && new URL(response.url()).pathname.endsWith('/reviews'))
  await page.getByRole('button', { name: 'Enviar reseña' }).click()
  const createdReview = await reviewResponse
  expect(createdReview.status()).toBe(201)
  expect(await createdReview.json()).toMatchObject({ created: true, status: 'PENDING' })
  await expect(page.locator('p[role="status"]').filter({
    hasText: 'Tu reseña fue enviada y quedó pendiente de moderación.',
  })).toHaveText('Tu reseña fue enviada y quedó pendiente de moderación.')

  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
  await page.getByRole('button', { name: 'Cerrar sesión' }).click()
  await page.goto('/login')
  await page.getByLabel('Correo electrónico').fill('e2e_admin@example.com')
  await page.getByLabel('Contraseña').fill('e2e_password')
  const adminLogin = page.waitForResponse((response) =>
    new URL(response.url()).pathname === '/api/v1/auth/login')
  await page.getByRole('button', { name: 'Iniciar sesión', exact: true }).click()
  expect((await adminLogin).status()).toBe(200)

  await page.goto('/admin/reviews')
  await expect(page.getByRole('heading', { name: 'Moderación de reseñas' })).toBeVisible()
  const reviewCard = page.locator('article').filter({ hasText: reviewBody })
  await expect(reviewCard.getByText(reviewBody, { exact: true })).toBeVisible()
  const moderationResponse = page.waitForResponse((response) =>
    response.request().method() === 'POST'
    && /\/api\/v1\/admin\/reviews\/\d+\/actions$/.test(new URL(response.url()).pathname))
  await reviewCard.getByRole('button', { name: /aceptar/i }).click()
  const moderation = await moderationResponse
  expect(moderation.status()).toBe(200)
  expect(await moderation.json()).toMatchObject({
    status: 'ACCEPTED',
    publicly_visible: true,
    cache_refresh_pending: false,
  })
  await expect(reviewCard.getByText('Estado: Aceptada', { exact: true })).toBeVisible()

  const publicDetail = await request.get(`${bff}/api/v1/games/synthetic-review-game`)
  expect(publicDetail.status()).toBe(200)
  const updated = await publicDetail.json() as typeof baseline
  const initialRatingTotal = baseline.approved_reviews.reduce((total, review) => total + review.rating, 0)
  const expectedAverage = (initialRatingTotal + 5) / (baseline.review_summary.approved_review_count + 1)
  expect(updated.review_summary.approved_review_count).toBe(baseline.review_summary.approved_review_count + 1)
  expect(updated.review_summary.average_rating).toBe(expectedAverage)
  expect(updated.approved_reviews).toEqual(expect.arrayContaining([
    expect.objectContaining({ body: reviewBody, rating: 5 }),
  ]))
})