import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { components } from '../../types/generated/bff-api'
import AdminRouter from '../AdminRouter'
import SalesPanel from './SalesPanel'

type SalesMetrics = components['schemas']['AdminSalesMetrics']

const emptyMetrics: SalesMetrics = {
  revenue_total: 0,
  orders_count: 0,
  top_products: [],
  orders_by_dispatch_status: [],
  orders_by_payment_status: [],
  revenue_by_day: [],
}

const completedMetrics: SalesMetrics = {
  revenue_total: 1234.5,
  orders_count: 4,
  top_products: [{ bgg_id: 274364, name: 'Watergate', units: 5, revenue: 1234.5 }],
  orders_by_dispatch_status: [
    { status: 'Pendiente', count: 1 },
    { status: 'En preparación', count: 1 },
    { status: 'Enviado', count: 1 },
    { status: 'Entregado', count: 1 },
  ],
  orders_by_payment_status: [{ status: 'paid', count: 4 }],
  revenue_by_day: [{ date: '2026-11-04', revenue: 1234.5 }],
}

const metricsRequests: URL[] = []
let metricsPayload = completedMetrics
let categoriesPayload = ['Estrategia', 'Cooperativo']

const server = setupServer(
  http.get('*/api/v1/admin/sales-metrics', ({ request }) => {
    metricsRequests.push(new URL(request.url))
    return HttpResponse.json(metricsPayload)
  }),
  http.get('*/api/v1/admin/sales-metrics/categories', () => HttpResponse.json(categoriesPayload)),
)

beforeAll(() => server.listen())
beforeEach(() => {
  metricsRequests.length = 0
  metricsPayload = completedMetrics
  categoriesPayload = ['Estrategia', 'Cooperativo']
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'admin-token' }))
  window.history.replaceState({}, '', '/admin/sales')
})
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
})
afterAll(() => server.close())

describe('SalesPanel', () => {
  it('routes /admin/sales and exposes the sales navigation link', async () => {
    const { unmount } = render(<AdminRouter path="/admin/sales" capabilities={{ is_staff: true, is_superuser: true }} onNavigate={() => undefined} />)

    expect(await screen.findByRole('heading', { name: 'Métricas de ventas' })).toBeInTheDocument()
    unmount()

    render(<AdminRouter path="/admin" capabilities={{ is_staff: true, is_superuser: true }} onNavigate={() => undefined} />)
    expect(within(screen.getByRole('navigation', { name: 'Navegación de administración' }))
      .getByRole('link', { name: 'Ventas' })).toHaveAttribute('href', '/admin/sales')
  })

  it('shows loading until the metrics request completes', async () => {
    let releaseMetrics: (() => void) | undefined
    server.use(http.get('*/api/v1/admin/sales-metrics', ({ request }) => {
      metricsRequests.push(new URL(request.url))
      return new Promise((resolve) => {
        releaseMetrics = () => resolve(HttpResponse.json(completedMetrics))
      })
    }))

    render(<SalesPanel />)

    expect(screen.getByRole('status')).toHaveTextContent(/cargando métricas/i)
    await waitFor(() => expect(releaseMetrics).toBeDefined())
    releaseMetrics?.()
    expect(await screen.findByRole('heading', { name: 'Métricas de ventas' })).toBeInTheDocument()
  })

  it('shows a sanitized error when metrics cannot be loaded', async () => {
    server.use(http.get('*/api/v1/admin/sales-metrics', () => HttpResponse.json({ detail: 'private upstream detail' }, { status: 502 })))

    render(<SalesPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no se pudieron cargar las métricas/i)
    expect(screen.queryByText('private upstream detail')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: /reintentar/i })).toBeInTheDocument()
  })

  it('shows the empty state when the selected range has no sales', async () => {
    metricsPayload = emptyMetrics

    render(<SalesPanel />)

    expect(await screen.findByText(/no hay ventas en el período seleccionado/i)).toBeInTheDocument()
  })

  it('renders revenue, order counts, products, and Spanish dispatch labels', async () => {
    render(<SalesPanel />)

    expect(await screen.findByRole('heading', { name: 'Métricas de ventas' })).toBeInTheDocument()
    expect(screen.getByText('Ingresos totales')).toBeInTheDocument()
    expect(screen.getByText('1.234,50')).toBeInTheDocument()
    expect(screen.getByText('Órdenes pagadas')).toBeInTheDocument()
    expect(screen.getByText('4')).toBeInTheDocument()
    expect(screen.getByRole('row', { name: /Watergate/ })).toHaveTextContent('5')
    expect(screen.getByText('Pendiente')).toBeInTheDocument()
    expect(screen.getByText('En preparación')).toBeInTheDocument()
    expect(screen.getByText('Enviado')).toBeInTheDocument()
    expect(screen.getByText('Entregado')).toBeInTheDocument()
  })

  it('uses the API default range and applies date, category, and product filters', async () => {
    render(<SalesPanel />)

    await screen.findByRole('heading', { name: 'Métricas de ventas' })
    expect(metricsRequests).toHaveLength(1)
    expect(metricsRequests[0].searchParams.has('from')).toBe(false)
    expect(metricsRequests[0].searchParams.has('to')).toBe(false)

    fireEvent.change(screen.getByLabelText('Desde (UTC)'), { target: { value: '2026-11-01T00:00' } })
    fireEvent.change(screen.getByLabelText('Hasta (UTC)'), { target: { value: '2026-11-05T00:00' } })
    fireEvent.change(screen.getByRole('combobox', { name: 'Categoría' }), { target: { value: 'Estrategia' } })
    fireEvent.change(screen.getByLabelText('ID del producto'), { target: { value: '274364' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    await waitFor(() => expect(metricsRequests).toHaveLength(2))
    const query = metricsRequests[1].searchParams
    expect(query.get('from')).toContain('2026-11-01')
    expect(query.get('to')).toContain('2026-11-05')
    expect(query.get('category')).toBe('Estrategia')
    expect(query.get('product_id')).toBe('274364')
  })

  it('exposes keyboard-reachable filter controls with accessible names', async () => {
    render(<SalesPanel />)

    expect(await screen.findByRole('form', { name: 'Filtros de ventas' })).toBeInTheDocument()
    const controls = [
      screen.getByLabelText('Desde (UTC)'),
      screen.getByLabelText('Hasta (UTC)'),
      screen.getByRole('combobox', { name: 'Categoría' }),
      screen.getByLabelText('ID del producto'),
      screen.getByRole('button', { name: 'Aplicar filtros' }),
    ]
    controls.forEach((control) => expect(control.tabIndex).toBeGreaterThanOrEqual(0))
  })
})