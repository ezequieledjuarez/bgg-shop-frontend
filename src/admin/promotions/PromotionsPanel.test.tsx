import { render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { components } from '../../types/generated/bff-api'
import PromotionsPanel from './PromotionsPanel'

type Promotion = components['schemas']['AdminPromotion']

const promotion: Promotion = {
  id: 'promo-7',
  name: 'Descuento de otoño',
  discount_percent: 25,
  product_bgg_id: 274364,
  active: true,
}

let payload: Promotion[] = [promotion]
const server = setupServer(
  http.get('*/api/v1/admin/promotions', () => HttpResponse.json(payload)),
)

beforeAll(() => server.listen())
beforeEach(() => {
  payload = [promotion]
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'admin-token' }))
  window.history.replaceState({}, '', '/admin/promotions')
})
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
})
afterAll(() => server.close())

describe('PromotionsPanel', () => {
  it('renders the generated promotion collection shape and its product/active state', async () => {
    render(<PromotionsPanel />)

    expect(await screen.findByText('Descuento de otoño')).toBeInTheDocument()
    expect(screen.getByRole('listitem')).toHaveTextContent(/25%\s*de descuento/)
    expect(screen.getByRole('listitem')).toHaveTextContent(/Producto #274364/)
    expect(screen.getByRole('listitem')).toHaveTextContent(/·\s*Activa/)
    expect(screen.getByRole('link', { name: 'Editar' })).toHaveAttribute('href', '/admin/promotions/promo-7')
  })

  it('labels productless promotions as global and keeps product-targeted rows distinct', async () => {
    payload = [{ ...promotion, id: 'promo-g', name: 'Oferta global', product_bgg_id: null }, promotion]
    render(<PromotionsPanel />)

    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent(/Todos los productos/)
    expect(items[0]).not.toHaveTextContent(/Producto #/)
    expect(items[1]).toHaveTextContent(/Producto #274364/)
  })

  it('shows an explicit empty state', async () => {
    payload = []
    render(<PromotionsPanel />)

    expect(await screen.findByText('Todavía no hay promociones.')).toBeInTheDocument()
  })

  it('shows a useful error when the list cannot be loaded', async () => {
    server.use(http.get('*/api/v1/admin/promotions', () => HttpResponse.json({ error: 'unavailable' }, { status: 502 })))
    render(<PromotionsPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las promociones.')
  })
})
