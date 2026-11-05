import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import App from '../../App'
import type { components } from '../../types/generated/bff-api'
import ReviewsPanel from './ReviewsPanel'

type AdminReview = components['schemas']['AdminReview']
type AdminReviewPage = components['schemas']['AdminReviewPage']
type ModerateReviewRequest = components['schemas']['ModerateReviewRequest']
type ModerateReviewResponse = components['schemas']['ModerateReviewResponse']
type ProductDetail = components['schemas']['ProductDetail']

const pendingReview: AdminReview = {
  review_id: 501,
  game_bgg_id: 13,
  game_name: 'Watergate',
  rating: 5,
  body: 'Great game',
  created_at: '2026-11-05T16:30:00Z',
  status: 'PENDING',
}

const queuePage = (items: AdminReview[]): AdminReviewPage => ({
  items,
  page: 1,
  page_size: 50,
  total: items.length,
  total_pages: items.length === 0 ? 0 : 1,
})

let currentStatus: AdminReview['status'] = 'PENDING'
let queueRequests = 0
let moderationRequest: ModerateReviewRequest | undefined

const publicDetail = (): ProductDetail => ({
  bgg_id: 13,
  name: 'Watergate',
  release_year: 2019,
  min_players: 2,
  max_players: 2,
  playing_time_minutes: 60,
  min_age: 12,
  weight: 2.25,
  category: ['Strategy'],
  price: 90000,
  quantity: 3,
  publisher: 'Example Publisher',
  image_url: '/watergate.webp',
  review_summary: {
    approved_review_count: currentStatus === 'ACCEPTED' ? 1 : 0,
    average_rating: currentStatus === 'ACCEPTED' ? 5 : null,
  },
  approved_reviews: currentStatus === 'ACCEPTED'
    ? [{ rating: 5, body: pendingReview.body, created_at: pendingReview.created_at }]
    : [],
})

const server = setupServer(
  http.get('*/api/v1/admin/reviews', () => {
    queueRequests += 1
    return HttpResponse.json(queuePage([{ ...pendingReview, status: currentStatus }]))
  }),
  http.post('*/api/v1/admin/reviews/:review_id/actions', async ({ request }) => {
    moderationRequest = await request.json() as ModerateReviewRequest
    currentStatus = moderationRequest.action === 'REJECT' ? 'REJECTED' : 'ACCEPTED'
    const response: ModerateReviewResponse = {
      review_id: pendingReview.review_id,
      status: currentStatus,
      deleted: false,
      publicly_visible: currentStatus === 'ACCEPTED',
      cache_refresh_pending: false,
    }
    return HttpResponse.json(response)
  }),
  http.get('*/api/v1/games/watergate', () => HttpResponse.json(publicDetail())),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  currentStatus = 'PENDING'
  queueRequests = 0
  moderationRequest = undefined
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'admin-token' }))
  window.history.replaceState({}, '', '/admin/reviews')
})
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
})
afterAll(() => server.close())

describe('ReviewsPanel', () => {
  it('announces queue loading until the response arrives', async () => {
    let releaseResponse: (() => void) | undefined
    server.use(http.get('*/api/v1/admin/reviews', () => new Promise<Response>((resolve) => {
      releaseResponse = () => resolve(HttpResponse.json(queuePage([pendingReview])))
    })))
    render(<ReviewsPanel />)

    expect(screen.getByRole('status')).toHaveTextContent(/cargando/i)
    await waitFor(() => expect(releaseResponse).toBeDefined())
    releaseResponse?.()

    expect(await screen.findByText('Great game')).toBeInTheDocument()
  })

  it('communicates when the moderation queue is empty', async () => {
    server.use(http.get('*/api/v1/admin/reviews', () => HttpResponse.json(queuePage([]))))
    render(<ReviewsPanel />)

    expect(await screen.findByText(/no hay reseñas/i)).toBeInTheDocument()
  })

  it('shows a safe error when the moderation queue cannot be loaded', async () => {
    server.use(http.get('*/api/v1/admin/reviews', () => HttpResponse.json(
      { detail: 'private upstream secret' },
      { status: 502 },
    )))
    render(<ReviewsPanel />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText('private upstream secret')).not.toBeInTheDocument()
  })

  it('shows game, review text, rating, and current moderation status', async () => {
    render(<ReviewsPanel />)

    expect(await screen.findByText('Watergate')).toBeInTheDocument()
    expect(screen.getByText('Great game')).toBeInTheDocument()
    expect(screen.getByText(/5\s*(?:\/|de)\s*5|5 estrellas/i)).toBeInTheDocument()
    expect(screen.getByText(/pendiente/i)).toBeInTheDocument()
  })

  it('accepts a review, refreshes the queue, and shows its refreshed public state', async () => {
    const panel = render(<ReviewsPanel />)
    expect(await screen.findByText('Great game')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }))

    await waitFor(() => expect(queueRequests).toBe(2))
    expect(moderationRequest).toEqual({ action: 'ACCEPT' })
    expect(await screen.findByText(/aceptad|accepted/i)).toBeInTheDocument()

    panel.unmount()
    window.history.replaceState({}, '', '/juegos/watergate')
    render(<App />)

    expect(await screen.findByText('“Great game”')).toBeVisible()
    expect(screen.getByText('1 reseñas · 5.0')).toBeVisible()
  })

  it('distinguishes a successful acceptance with pending public cache refresh', async () => {
    server.use(http.post('*/api/v1/admin/reviews/:review_id/actions', () => {
      const response: ModerateReviewResponse = {
        review_id: pendingReview.review_id,
        status: 'ACCEPTED',
        deleted: false,
        publicly_visible: true,
        cache_refresh_pending: true,
      }
      currentStatus = 'ACCEPTED'
      return HttpResponse.json(response)
    }))
    render(<ReviewsPanel />)
    expect(await screen.findByText('Great game')).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }))

    expect(await screen.findByRole('status')).toHaveTextContent(
      'La acción se completó, pero la actualización de la vista pública está pendiente.',
    )
    await waitFor(() => expect(queueRequests).toBe(2))
  })

  it('rejects an accepted review, displays the rejected status, and refreshes its public state', async () => {
    currentStatus = 'ACCEPTED'
    const panel = render(<ReviewsPanel />)
    expect(await screen.findByText(/aceptada/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /rechazar/i }))

    await waitFor(() => expect(queueRequests).toBe(2))
    expect(moderationRequest).toEqual({ action: 'REJECT' })
    expect(await screen.findByText(/rechazada/i)).toBeInTheDocument()

    panel.unmount()
    window.history.replaceState({}, '', '/juegos/watergate')
    render(<App />)

    expect(await screen.findByText('0 reseñas · Sin calificaciones')).toBeVisible()
    expect(screen.getByText('Todavía no hay reseñas aprobadas.')).toBeVisible()
    expect(screen.queryByText('“Great game”')).not.toBeInTheDocument()
  })

  it('restores a rejected review to accepted and refreshes its public state', async () => {
    currentStatus = 'REJECTED'
    const panel = render(<ReviewsPanel />)
    expect(await screen.findByText(/rechazada/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /aceptar/i }))

    await waitFor(() => expect(queueRequests).toBe(2))
    expect(moderationRequest).toEqual({ action: 'ACCEPT' })
    expect(await screen.findByText(/aceptada/i)).toBeInTheDocument()

    panel.unmount()
    window.history.replaceState({}, '', '/juegos/watergate')
    render(<App />)

    expect(await screen.findByText('“Great game”')).toBeVisible()
    expect(screen.getByText('1 reseñas · 5.0')).toBeVisible()
  })

  it('shows safe failure feedback when rejecting a review fails', async () => {
    server.use(http.post('*/api/v1/admin/reviews/:review_id/actions', () => HttpResponse.json(
      { detail: 'private upstream secret' },
      { status: 502 },
    )))
    currentStatus = 'ACCEPTED'
    render(<ReviewsPanel />)
    expect(await screen.findByText(/aceptada/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /rechazar/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'No se pudo completar la moderación en este momento.',
    )
    expect(screen.queryByText('private upstream secret')).not.toBeInTheDocument()
    expect(queueRequests).toBe(1)
  })
})
