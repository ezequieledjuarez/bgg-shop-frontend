import { StrictMode } from 'react'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { components } from './types/generated/bff-api'
import { SESSION_STORAGE_KEY } from './auth/session'
import { redirectToPayment } from './checkout/navigation'

vi.mock('./checkout/navigation', () => ({ redirectToPayment: vi.fn() }))
import App from './App'

type PurchaseOrder = components['schemas']['PurchaseOrder']
const orderId = 'a14a6ee8-c9a2-4f1c-9c6f-0195ca5da001'
const approvedOrder: PurchaseOrder = {
  id: orderId,
  status: 'paid',
  total: 12500,
  currency: 'ARS',
  shipping_mode: 'standard',
  recipient: 'Ana Pérez',
  street: 'Calle 123',
  city: 'Córdoba',
  postal_code: '5000',
  payment_status: 'approved',
  payment_status_detail: null,
  created_at: '2026-10-20T10:00:00Z',
  paid_at: '2026-10-20T10:05:00Z',
  lines: [{ bgg_id: 1, name: 'Watergate', quantity: 1, unit_price: 12500, subtotal: 12500 }],
  invoice: { number: 44, issued_at: '2026-10-20T10:05:00Z', total: 12500 },
}
const cart: components['schemas']['CartResponse'] = {
  lines: [{ bgg_id: 1, name: 'Watergate', quantity: 1, available_stock: 4, unit_price: 12500, subtotal: 12500 }],
  total: 12500,
  warnings: [],
}
let confirmCalls = 0
let checkoutCalls = 0
let invoiceCalls = 0
let ordersList: PurchaseOrder[] = [approvedOrder]
let detailOrder: PurchaseOrder = approvedOrder
let confirmationOrder: PurchaseOrder = approvedOrder
const server = setupServer(
  http.get('*/api/v1/cart', () => HttpResponse.json(cart)),
  http.post('*/api/v1/checkout', async ({ request }) => {
    checkoutCalls += 1
    expect(request.headers.get('Authorization')).toBe('Bearer purchase-token')
    return HttpResponse.json({ order: approvedOrder, init_point: 'https://payments.example/initialize' } satisfies components['schemas']['CheckoutResponse'])
  }),
  http.post('*/api/v1/checkout/confirm', async ({ request }) => {
    confirmCalls += 1
    expect(request.headers.get('Authorization')).toBe('Bearer purchase-token')
    const body = await request.json() as components['schemas']['ConfirmPaymentRequest']
    expect(body).toMatchObject({ order_id: orderId })
    return HttpResponse.json({ order: confirmationOrder } satisfies components['schemas']['OrderResponse'])
  }),
  http.get('*/api/v1/orders', () => HttpResponse.json({ orders: ordersList } satisfies components['schemas']['OrderListResponse'])),
  http.get(`*/api/v1/orders/${orderId}`, () => HttpResponse.json({ order: detailOrder } satisfies components['schemas']['OrderResponse'])),
  http.post(`*/api/v1/orders/${orderId}/retry-payment`, () => HttpResponse.json({ order: approvedOrder, init_point: 'https://payments.example/retry' } satisfies components['schemas']['CheckoutResponse'])),
  http.get(`*/api/v1/orders/${orderId}/invoice`, ({ request }) => {
    invoiceCalls += 1
    expect(request.headers.get('Authorization')).toBe('Bearer purchase-token')
    return new HttpResponse(new Blob(['pdf-content'], { type: 'application/pdf' }), { headers: { 'Content-Type': 'application/pdf' } })
  }),
)


beforeAll(() => server.listen())
beforeEach(() => {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: 'purchase-token' }))
  confirmCalls = 0
  checkoutCalls = 0
  invoiceCalls = 0
  ordersList = [approvedOrder]
  detailOrder = approvedOrder
  confirmationOrder = approvedOrder
})
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
  window.history.replaceState({}, '', '/')
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
afterAll(() => server.close())

function at(path: string) {
  window.history.replaceState({}, '', path)
}

function fillAddress() {
  fireEvent.change(screen.getByLabelText(/Nombre de quien recibe/), { target: { value: 'Ana Pérez' } })
  fireEvent.change(screen.getByLabelText('Calle y número'), { target: { value: 'Calle 123' } })
  fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: 'Córdoba' } })
  fireEvent.change(screen.getByLabelText('Código postal'), { target: { value: '5000' } })
}

describe('purchase checkout and orders', () => {
  it('validates required shipping fields accessibly before creating checkout', async () => {
    at('/checkout')
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a Mercado Pago' }))
    expect(await screen.findAllByText('Este dato es obligatorio.')).toHaveLength(4)
    expect(screen.getByLabelText(/Nombre de quien recibe/)).toHaveAttribute('aria-invalid', 'true')
    expect(checkoutCalls).toBe(0)
  })

  it('sends the authenticated address and redirects to the payment initialization URL', async () => {
    at('/checkout')
    render(<App />)
    fillAddress()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a Mercado Pago' }))
    await waitFor(() => expect(checkoutCalls).toBe(1))
    expect(redirectToPayment).toHaveBeenCalledWith('https://payments.example/initialize')
  })

  it('disables checkout for an empty cart and asks anonymous buyers to sign in', async () => {
    at('/carrito')
    server.use(http.get('*/api/v1/cart', () => HttpResponse.json({ lines: [], total: 0, warnings: [] } satisfies components['schemas']['CartResponse'])))
    sessionStorage.clear()
    const { unmount } = render(<App />)
    expect(await screen.findByRole('button', { name: 'Proceder al Pago' })).toBeDisabled()
    unmount()

    server.use(http.get('*/api/v1/cart', () => HttpResponse.json(cart)))
    render(<App />)
    fireEvent.click(await screen.findByRole('button', { name: 'Proceder al Pago' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Iniciá sesión para continuar con tu compra.')
    expect(checkoutCalls).toBe(0)
  })

  it('requires login instead of attempting anonymous checkout', async () => {
    sessionStorage.clear()
    at('/checkout')
    render(<App />)
    expect(screen.getByText('Iniciá sesión para continuar con tu compra.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Iniciar sesión' })).toBeInTheDocument()
    expect(checkoutCalls).toBe(0)
  })

  it.each([
    ['PAYMENTS_DISABLED', 'Los pagos están temporalmente deshabilitados.'],
    ['INSUFFICIENT_STOCK', 'No hay stock suficiente para completar la compra.'],
    ['EMPTY_CART', 'Tu carrito está vacío. Agregá juegos antes de proceder al pago.'],
  ])('shows Spanish checkout feedback for %s', async (code, message) => {
    server.use(http.post('*/api/v1/checkout', async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
      return HttpResponse.json({ errors: [{ code, message: 'Core detail' }] }, { status: 409 })
    }))
    at('/checkout')
    render(<App />)
    fillAddress()
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a Mercado Pago' }))
    expect(screen.getByRole('button', { name: 'Conectando con Mercado Pago…' })).toBeDisabled()
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
  })

  it('confirms an approved payment once in StrictMode and shows the order and invoice action', async () => {
    at(`/compra/resultado?payment_id=pay-123&external_reference=${orderId}`)
    render(<StrictMode><App /></StrictMode>)
    expect(await screen.findByRole('heading', { name: '¡Gracias por tu compra!' })).toBeInTheDocument()
    expect(screen.getByText(/Total:.*12\.500/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar factura' })).toBeInTheDocument()
    await waitFor(() => expect(confirmCalls).toBe(1))
  })

  it('accepts collection_id and shows the payment rejection reason with retry action', async () => {
    confirmationOrder = { ...approvedOrder, status: 'rejected', payment_status: 'rejected', payment_status_detail: 'cc_rejected_insufficient_amount' }
    at(`/compra/resultado?collection_id=pay-456&external_reference=${orderId}`)
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'No se pudo aprobar el pago' })).toBeInTheDocument()
    expect(screen.getByText(/cc_rejected_insufficient_amount/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar pago' }))
    expect(await screen.findByRole('heading', { name: 'No se pudo aprobar el pago' })).toBeInTheDocument()
    await waitFor(() => expect(redirectToPayment).toHaveBeenCalledWith('https://payments.example/retry'))
  })

  it('allows a pending payment to be verified again on request', async () => {
    confirmationOrder = { ...approvedOrder, status: 'pending_payment', payment_status: 'pending', invoice: null }
    at(`/compra/resultado?payment_id=pay-789&order_id=${orderId}`)
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Pago pendiente' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Verificar de nuevo' }))
    await waitFor(() => expect(confirmCalls).toBe(2))
  })

  it('explains that a paid stock conflict requires support', async () => {
    confirmationOrder = { ...approvedOrder, status: 'paid_stock_conflict', invoice: null }
    at(`/compra/resultado?payment_id=pay-conflict&external_reference=${orderId}`)
    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Pago recibido' })).toBeInTheDocument()
    expect(screen.getByText(/el stock se agotó antes de confirmar la compra/i)).toBeInTheDocument()
  })

  it('shows order history and detail with a paid invoice download', async () => {
    at('/mis-compras')
    render(<App />)
    const row = await screen.findByRole('listitem')
    expect(within(row).getByText('Pagada')).toBeInTheDocument()
    fireEvent.click(within(row).getByRole('button', { name: 'Ver detalle' }))
    expect(await screen.findByText(`Compra ${orderId}`)).toBeInTheDocument()
    const createUrl = vi.fn(() => 'blob:invoice')
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar factura' }))
    await waitFor(() => expect(invoiceCalls).toBe(1))
    expect(createUrl).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    delete (URL as unknown as { createObjectURL?: unknown }).createObjectURL
    delete (URL as unknown as { revokeObjectURL?: unknown }).revokeObjectURL
  })

  it('shows empty and error states in the order list', async () => {
    ordersList = []
    at('/mis-compras')
    const { unmount } = render(<App />)
    expect(await screen.findByText('Todavía no tenés compras.')).toBeInTheDocument()
    unmount()
    server.use(http.get('*/api/v1/orders', () => HttpResponse.json({ errors: [{ code: 'UPSTREAM_ERROR', message: 'fail' }] }, { status: 502 })))
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudieron cargar las compras.')
  })
})
