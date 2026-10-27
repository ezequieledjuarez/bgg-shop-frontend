import { fireEvent, render, screen, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { components } from './types/generated/bff-api'
import App from './App'

type Product = components['schemas']['Product']
type ProductDetail = components['schemas']['ProductDetail']

const watergate: Product = {
  bgg_id: 1,
  name: 'Watergate',
  release_year: 2019,
  min_players: 2,
  max_players: 2,
  playing_time_minutes: 60,
  min_age: 12,
  weight: 2.25,
  category: ['Juegos de Estrategia'],
  price: 90000,
  quantity: 3,
  publisher: 'Salt & Pepper Games',
  image_url: '/watergate.webp',
}

const detail: ProductDetail = {
  bgg_id: watergate.bgg_id,
  name: watergate.name,
  release_year: watergate.release_year,
  min_players: watergate.min_players,
  max_players: watergate.max_players,
  playing_time_minutes: watergate.playing_time_minutes,
  min_age: watergate.min_age,
  weight: watergate.weight,
  category: watergate.category,
  price: watergate.price,
  quantity: watergate.quantity,
  publisher: watergate.publisher,
  image_url: watergate.image_url,
  review_summary: { approved_review_count: 0, average_rating: null },
  approved_reviews: [],
}

const products: components['schemas']['ProductPage'] = {
  items: [watergate],
  page: 1,
  page_size: 100,
  total: 1,
  total_pages: 1,
}

const emptyCart: components['schemas']['CartResponse'] = { lines: [], total: 0, warnings: [] }
let wishlist: Product[] = []

const server = setupServer(
  http.get('*/api/v1/products', () => HttpResponse.json(products)),
  http.get('*/api/v1/games/watergate', () => HttpResponse.json(detail)),
  http.get('*/api/v1/wishlist', () => HttpResponse.json({ items: wishlist })),
  http.post('*/api/v1/wishlist', async ({ request }) => {
    const payload = await request.json() as components['schemas']['WishlistAddRequest']
    wishlist = [watergate]
    expect(payload).toEqual({ bgg_id: watergate.bgg_id })
    return HttpResponse.json(watergate)
  }),
  http.delete('*/api/v1/wishlist/:bgg_id', () => {
    wishlist = []
    return HttpResponse.json(watergate)
  }),
  http.get('*/api/v1/cart', () => HttpResponse.json(emptyCart)),
  http.post('*/api/v1/cart/items', () => HttpResponse.json({
    ...emptyCart,
    lines: [{ bgg_id: 1, name: 'Watergate', quantity: 1, available_stock: 3, unit_price: 90000, subtotal: 90000 }],
    total: 90000,
  })),
  http.post('*/api/v1/auth/login', () => HttpResponse.json({
    session: { access_token: 'wishlist-token', refresh_token: null, csrf_token: null },
  })),
)

beforeAll(() => server.listen())
afterEach(() => {
  server.resetHandlers()
  wishlist = []
  vi.restoreAllMocks()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})
afterAll(() => server.close())

describe('Wishlist', () => {
  it('saves a product from its detail page with the authenticated session', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'wishlist-token' }))
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<App />)
    await screen.findByRole('article', { name: /watergate/i })
    fireEvent.click(screen.getByRole('button', { name: /ver detalles de watergate/i }))
    await screen.findByRole('heading', { name: 'Watergate' })
    expect(window.location.search).toBe('?bgg_id=1')
    fireEvent.click(screen.getByRole('button', { name: /guardar en mi lista de deseos/i }))

    expect(await screen.findByText(/se agregó a tu lista de deseos/i)).toBeInTheDocument()
    const request = fetchSpy.mock.calls.find(([input]) => String(input).includes('/wishlist'))
    expect(request?.[1]?.method).toBe('POST')
    expect(new Headers(request?.[1]?.headers).get('Authorization')).toBe('Bearer wishlist-token')
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ bgg_id: 1 })
  })

  it('saves a product from a direct detail URL without a bgg_id query parameter', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'wishlist-token' }))
    window.history.replaceState({}, '', '/juegos/watergate')
    const fetchSpy = vi.spyOn(globalThis, 'fetch')

    render(<App />)
    await screen.findByRole('heading', { name: 'Watergate' })
    fireEvent.click(screen.getByRole('button', { name: /guardar en mi lista de deseos/i }))

    expect(await screen.findByText(/se agregó a tu lista de deseos/i)).toBeInTheDocument()
    const request = fetchSpy.mock.calls.find(([input]) => String(input).includes('/wishlist'))
    expect(request?.[1]?.method).toBe('POST')
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ bgg_id: 1 })
  })

  it('sends an anonymous save through login and returns to the product detail route', async () => {
    window.history.replaceState({}, '', '/juegos/watergate?bgg_id=1')
    render(<App />)

    await screen.findByRole('heading', { name: 'Watergate' })
    fireEvent.click(screen.getByRole('button', { name: /guardar en mi lista de deseos/i }))

    expect(await screen.findByRole('heading', { name: /te damos la bienvenida/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(sessionStorage.getItem('bgg-shop.pending-return')).toBe('/juegos/watergate?bgg_id=1')
  })

  it('returns from login to a protected Wishlist route', async () => {
    window.history.replaceState({}, '', '/wishlist')
    render(<App />)

    expect(await screen.findByRole('heading', { name: /te damos la bienvenida/i })).toBeInTheDocument()
    expect(sessionStorage.getItem('bgg-shop.pending-return')).toBe('/wishlist')

    fireEvent.change(screen.getByLabelText(/correo electrónico/i), { target: { value: 'buyer@example.test' } })
    fireEvent.change(screen.getByLabelText(/contraseña/i), { target: { value: 'valid-password' } })
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }))

    expect(await screen.findByRole('heading', { name: 'Lista de deseos' })).toBeInTheDocument()
    expect(await screen.findByText(/tu lista de deseos está vacía/i)).toBeInTheDocument()
  })

  it('shows an empty Wishlist', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'wishlist-token' }))
    window.history.replaceState({}, '', '/wishlist')
    render(<App />)

    expect(await screen.findByText(/tu lista de deseos está vacía/i)).toBeInTheDocument()
  })

  it('lists saved products and removes an item', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'wishlist-token' }))
    wishlist = [watergate]
    window.history.replaceState({}, '', '/wishlist')
    render(<App />)

    const item = await screen.findByRole('listitem', { name: /watergate/i })
    fireEvent.click(within(item).getByRole('button', { name: /quitar watergate de mi lista/i }))

    expect(await screen.findByText(/tu lista de deseos está vacía/i)).toBeInTheDocument()
  })

  it('adds a Wishlist product to the cart without removing it from Wishlist', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'wishlist-token' }))
    wishlist = [watergate]
    window.history.replaceState({}, '', '/wishlist')
    render(<App />)

    const item = await screen.findByRole('listitem', { name: /watergate/i })
    fireEvent.click(within(item).getByRole('button', { name: /agregar watergate al carrito/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(/se agregó al carrito/i)
    expect(screen.getByRole('listitem', { name: /watergate/i })).toBeInTheDocument()
  })

  it('shows explicit loading and API error states', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'wishlist-token' }))
    window.history.replaceState({}, '', '/wishlist')
    server.use(http.get('*/api/v1/wishlist', () => HttpResponse.json({ errors: [{ code: 'UPSTREAM_ERROR', message: 'falló' }] }, { status: 502 })))

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent(/cargando tu lista de deseos/i)
    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudo cargar tu lista de deseos/i)
  })

  it('returns an invalid session to login while preserving the Wishlist route', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'expired-token' }))
    window.history.replaceState({}, '', '/wishlist')
    server.use(http.get('*/api/v1/wishlist', () => HttpResponse.json({
      errors: [{ code: 'UNAUTHENTICATED', message: 'Sesión inválida.' }],
    }, { status: 401 })))

    render(<App />)

    expect(await screen.findByRole('heading', { name: /te damos la bienvenida/i })).toBeInTheDocument()
    expect(window.location.pathname).toBe('/login')
    expect(sessionStorage.getItem('bgg-shop.pending-return')).toBe('/wishlist')
  })

  it('reports stock errors when adding a Wishlist item to the cart', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'wishlist-token' }))
    wishlist = [watergate]
    window.history.replaceState({}, '', '/wishlist')
    server.use(http.post('*/api/v1/cart/items', () => HttpResponse.json({
      warnings: [{ code: 'INSUFFICIENT_STOCK', message: 'No hay stock suficiente.' }],
      lines: [],
      total: 0,
    }, { status: 409 })))

    render(<App />)
    const item = await screen.findByRole('listitem', { name: /watergate/i })
    fireEvent.click(within(item).getByRole('button', { name: /agregar watergate al carrito/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(/no hay stock suficiente/i)
    expect(screen.getByRole('listitem', { name: /watergate/i })).toBeInTheDocument()
  })

  it('links to Wishlist from authenticated navigation', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'wishlist-token' }))
    render(<App />)

    fireEvent.click(await screen.findByRole('link', { name: /lista de deseos/i }))

    expect(await screen.findByRole('heading', { name: /lista de deseos/i })).toBeInTheDocument()
  })
})
