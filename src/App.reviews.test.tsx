import { fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import App from './App'
import type { components } from './types/generated/bff-api'

const detail: components['schemas']['ProductDetail'] = {
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
  publisher: 'Example Publisher',
  image_url: '/watergate.webp',
  review_summary: { approved_review_count: 1, average_rating: 4 },
  approved_reviews: [{ rating: 4, body: 'Approved review', created_at: '2026-01-02T03:04:05Z' }],
}

const server = setupServer(
  http.get('*/api/v1/games/watergate', () => HttpResponse.json(detail)),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => window.history.replaceState({}, '', '/juegos/watergate'))
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
})
afterAll(() => server.close())

describe('Product detail and reviews', () => {
  it('shows product details and approved review information', async () => {
    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Watergate' })).toBeVisible()
    expect(screen.getByRole('img', { name: 'Portada de Watergate' })).toBeVisible()
    expect(screen.getByText('1 reseñas · 4.0')).toBeVisible()
    expect(screen.getByText('“Approved review”')).toBeVisible()
  })

  it('shows the empty review state and a not-found response', async () => {
    server.use(http.get('*/api/v1/games/watergate', () => HttpResponse.json({
      ...detail, review_summary: { approved_review_count: 0, average_rating: null }, approved_reviews: [],
    })))
    const view = render(<App />)
    expect(await screen.findByText('Todavía no hay reseñas aprobadas.')).toBeVisible()
    view.unmount()

    server.use(http.get('*/api/v1/games/watergate', () => new HttpResponse(null, { status: 404 })))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No encontramos ese juego.')
  })

  it('requires authentication without sending an anonymous review', async () => {
    let sent = false
    server.use(http.post('*/api/v1/games/watergate/reviews', () => {
      sent = true
      return HttpResponse.json({})
    }))
    render(<App />)
    await screen.findByRole('heading', { name: 'Watergate' })
    fireEvent.change(screen.getByLabelText('Reseña'), { target: { value: 'An anonymous review' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Iniciá sesión para dejar una reseña.')
    expect(sent).toBe(false)
  })

  it('submits a trimmed authenticated review and shows pending confirmation', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'synthetic-token' }))
    let authorization: string | null = null
    let payload: unknown
    server.use(http.post('*/api/v1/games/watergate/reviews', async ({ request }) => {
      authorization = request.headers.get('Authorization')
      payload = await request.json()
      return HttpResponse.json({ created: true, status: 'PENDING', created_at: '2026-01-02T03:04:05Z' }, { status: 201 })
    }))
    render(<App />)
    await screen.findByRole('heading', { name: 'Watergate' })
    fireEvent.change(screen.getByLabelText('Calificación'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Reseña'), { target: { value: '  Great game  ' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    expect(await screen.findAllByText('Tu reseña fue enviada y quedó pendiente de moderación.')).toHaveLength(2)
    expect(authorization).toBe('Bearer synthetic-token')
    expect(payload).toEqual({ rating: 4, body: 'Great game' })
    expect(screen.queryByText('“Great game”')).not.toBeInTheDocument()
  })

  it('shows a safe duplicate message instead of upstream details', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'synthetic-token' }))
    server.use(http.post('*/api/v1/games/watergate/reviews', () => HttpResponse.json({
      errors: [{ code: 'REVIEW_ALREADY_EXISTS', message: 'private upstream detail' }],
    }, { status: 409 })))
    render(<App />)
    await screen.findByRole('heading', { name: 'Watergate' })
    fireEvent.change(screen.getByLabelText('Reseña'), { target: { value: 'Another review' } })
    fireEvent.click(screen.getByRole('button', { name: 'Enviar reseña' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya dejaste una reseña para este juego.')
    expect(screen.queryByText('private upstream detail')).not.toBeInTheDocument()
  })
})