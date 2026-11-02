import { render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { components } from '../../types/generated/bff-api'
import CouponsPanel from './CouponsPanel'

type Coupon = components['schemas']['AdminCoupon']

const sampleCoupon: Coupon = {
  id: 41,
  code: 'WinterSAVE',
  discount_percent: 12.5,
  remaining: 8,
  active: false,
  starts_at: null,
  ends_at: '2027-01-01T00:00:00Z',
  created_at: '2026-01-01T00:00:00Z',
}

let coupons: Coupon[] = []
const server = setupServer(
  http.get('*/api/v1/admin/coupons', () => HttpResponse.json(coupons)),
)

beforeAll(() => server.listen())
beforeEach(() => {
  coupons = []
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'admin-token' }))
  window.history.replaceState({}, '', '/admin/coupons')
})
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
})
afterAll(() => server.close())

describe('CouponsPanel', () => {
  it('shows loading while the coupon request is pending', async () => {
    let releaseResponse: (() => void) | undefined
    server.use(http.get('*/api/v1/admin/coupons', () => new Promise((resolve) => {
      releaseResponse = () => resolve(HttpResponse.json([]))
    })))
    render(<CouponsPanel />)

    expect(screen.getByRole('status')).toHaveTextContent('Cargando cupones')
    await waitFor(() => expect(releaseResponse).toBeDefined())
    releaseResponse?.()
    expect(await screen.findByText('Todavía no hay cupones.')).toBeInTheDocument()
  })

  it('shows an explicit permission error', async () => {
    server.use(http.get('*/api/v1/admin/coupons', () => HttpResponse.json({}, { status: 403 })))
    render(<CouponsPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permisos para administrar cupones.')
  })

  it('shows the empty state and a create link when no coupons exist', async () => {
    render(<CouponsPanel />)

    expect(await screen.findByText('Todavía no hay cupones.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Crear cupón' })).toHaveAttribute('href', '/admin/coupons/new')
  })

  it('lists coupon details and links to edit and deactivate', async () => {
    coupons = [sampleCoupon]
    render(<CouponsPanel />)

    expect(await screen.findByRole('table', { name: 'Cupones' })).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /WinterSAVE/ })).toHaveTextContent('12.5%')
    expect(screen.getByText('Inactivo')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Editar / activar o desactivar' })).toHaveAttribute('href', '/admin/coupons/41')
    expect(screen.queryByRole('button', { name: /eliminar|borrar/i })).not.toBeInTheDocument()
  })
})
