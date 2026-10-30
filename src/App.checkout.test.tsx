import { StrictMode } from 'react'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { components } from './types/generated/bff-api'
import { SESSION_CHANGE_EVENT, SESSION_STORAGE_KEY } from './auth/session'
import { redirectToPayment } from './checkout/navigation'
import { beginCreditAttempt, CreditIdentityError, CreditStorageError } from './checkout/credit'

vi.mock('./checkout/navigation', () => ({ redirectToPayment: vi.fn() }))
import App from './App'

type PurchaseOrder = components['schemas']['PurchaseOrder']
const orderId = 'a14a6ee8-c9a2-4f1c-9c6f-0195ca5da001'
const tokenFor = (sub: unknown, signature = 'signature') => `header.${btoa(JSON.stringify({ sub })).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')}.${signature}`
const purchaseToken = tokenFor('account-a')
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
  http.get('*/api/v1/credit', () => HttpResponse.json({ balance: '0.00', currency: 'ARS' } satisfies components['schemas']['CreditBalance'])),
  http.post('*/api/v1/checkout', async ({ request }) => {
    checkoutCalls += 1
    expect(request.headers.get('Authorization')).toBe(`Bearer ${purchaseToken}`)
    return HttpResponse.json({ order: approvedOrder, init_point: 'https://payments.example/initialize' } satisfies components['schemas']['CheckoutResponse'])
  }),
  http.post('*/api/v1/checkout/confirm', async ({ request }) => {
    confirmCalls += 1
    expect(request.headers.get('Authorization')).toBe(`Bearer ${purchaseToken}`)
    const body = await request.json() as components['schemas']['ConfirmPaymentRequest']
    expect(body).toMatchObject({ order_id: orderId })
    return HttpResponse.json({ order: confirmationOrder } satisfies components['schemas']['OrderResponse'])
  }),
  http.get('*/api/v1/orders', () => HttpResponse.json({ orders: ordersList } satisfies components['schemas']['OrderListResponse'])),
  http.get(`*/api/v1/orders/${orderId}`, () => HttpResponse.json({ order: detailOrder } satisfies components['schemas']['OrderResponse'])),
  http.post(`*/api/v1/orders/${orderId}/retry-payment`, () => HttpResponse.json({ order: approvedOrder, init_point: 'https://payments.example/retry' } satisfies components['schemas']['CheckoutResponse'])),
  http.get(`*/api/v1/orders/${orderId}/invoice`, ({ request }) => {
    invoiceCalls += 1
    expect(request.headers.get('Authorization')).toBe(`Bearer ${purchaseToken}`)
    return new HttpResponse(new Blob(['pdf-content'], { type: 'application/pdf' }), { headers: { 'Content-Type': 'application/pdf' } })
  }),
)


beforeAll(() => server.listen())
beforeEach(() => {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: purchaseToken }))
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
  it.each(['redeem', 'checkout'] as const)('does not lock %s when identity fails before an attempt exists', async (operation) => {
    let calls = 0
    server.use(http.post('*/api/v1/gift-cards/redeem', () => { calls += 1; return HttpResponse.json({}) }))
    server.use(http.post('*/api/v1/checkout/credit', () => { calls += 1; return HttpResponse.json({}) }))
    at('/checkout')
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    if (operation === 'redeem') fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'CODE' } })
    else {
      fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
      fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    }
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: 'invalid-token' }))
    fireEvent.click(screen.getByRole('button', { name: operation === 'redeem' ? 'Canjear' : 'Pagar con crédito' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('identidad válida')
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBeNull()
    expect(screen.getByLabelText('Medio de pago')).toBeEnabled()
    expect(calls).toBe(0)
  })

  it('clears account data and ignores an old balance response when the session changes', async () => {
    let finish!: () => void
    let started = false
    const pending = new Promise<void>((resolve) => { finish = resolve })
    server.use(http.get('*/api/v1/credit', async ({ request }) => {
      if (request.headers.get('Authorization') === `Bearer ${purchaseToken}`) {
        started = true
        await pending
        return HttpResponse.json({ balance: '100.00', currency: 'ARS' })
      }
      return HttpResponse.json({ balance: '200.00', currency: 'ARS' })
    }))
    at('/checkout')
    render(<App />)
    await waitFor(() => expect(started).toBe(true))
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'ACCOUNT-A-CODE' } })
    act(() => {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: tokenFor('account-b') }))
      window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
    })
    expect(screen.getByLabelText('Código de gift card')).toHaveValue('')
    expect(await screen.findByText(/200,00 ARS/)).toBeInTheDocument()
    await act(async () => { finish(); await pending })
    expect(screen.queryByText(/100,00 ARS/)).not.toBeInTheDocument()
    expect(screen.getByText(/200,00 ARS/)).toBeInTheDocument()
  })

  it.each(['redeem', 'checkout'] as const)('keeps an in-flight %s attempt when sessions change and ignores its response', async (operation) => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    const keys: string[] = []
    const path = operation === 'redeem' ? 'gift-cards/redeem' : 'checkout/credit'
    server.use(
      http.get('*/api/v1/credit', ({ request }) => HttpResponse.json({ balance: request.headers.get('Authorization') === `Bearer ${purchaseToken}` ? '100.00' : '200.00', currency: 'ARS' })),
      http.post(`*/api/v1/${path}`, async ({ request }) => {
        keys.push(request.headers.get('Idempotency-Key')!)
        if (keys.length === 1) await pending
        return operation === 'redeem'
          ? HttpResponse.json({ balance: '300.00', currency: 'ARS' })
          : HttpResponse.json({ order: approvedOrder, credit: { balance: '0.00', currency: 'ARS' } })
      }),
    )
    at('/checkout')
    render(<App />)
    await screen.findByText(/100,00 ARS/)
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'ACCOUNT-A-CODE' } })
    if (operation === 'checkout') {
      fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
      fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    }
    fireEvent.click(screen.getByRole('button', { name: operation === 'redeem' ? 'Canjear' : 'Pagar con crédito' }))
    await waitFor(() => expect(keys).toHaveLength(1))
    const stored = sessionStorage.getItem('checkout.credit-attempt')
    act(() => {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: tokenFor('account-b') }))
      window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
    })
    expect(screen.getByLabelText('Código de gift card')).toHaveValue('')
    expect(screen.queryByText(/100,00 ARS/)).not.toBeInTheDocument()
    await screen.findByText(/200,00 ARS/)
    await act(async () => { finish(); await pending })
    await waitFor(() => expect(screen.queryByRole('button', { name: operation === 'redeem' ? 'Canjeando…' : 'Procesando compra…' })).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByLabelText('Medio de pago')).toBeDisabled())
    expect(screen.queryByText(/300,00 ARS/)).not.toBeInTheDocument()
    expect(screen.queryByText('Gift card canjeada.')).not.toBeInTheDocument()
    expect(screen.queryByText('¡Gracias por tu compra!')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBe(stored)
    if (operation === 'redeem') fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'ACCOUNT-A-CODE' } })
    fireEvent.click(screen.getByRole('button', { name: operation === 'redeem' ? 'Reintentar canje' : 'Reintentar compra con crédito' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('cuenta actual')
    expect(keys).toHaveLength(1)
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBe(stored)
    act(() => {
      sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: purchaseToken }))
      window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
    })
    await screen.findByText(/100,00 ARS/)
    if (operation === 'redeem') fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'ACCOUNT-A-CODE' } })
    fireEvent.click(screen.getByRole('button', { name: operation === 'redeem' ? 'Reintentar canje' : 'Reintentar compra con crédito' }))
    await screen.findByText(operation === 'redeem' ? 'Gift card canjeada.' : '¡Gracias por tu compra!')
    expect(keys).toEqual([keys[0], keys[0]])
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBeNull()
  })

  it.each(['redeem', 'checkout'] as const)('retains an in-flight %s attempt after switching away and back before a rejection', async (operation) => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    let calls = 0
    const path = operation === 'redeem' ? 'gift-cards/redeem' : 'checkout/credit'
    server.use(http.post(`*/api/v1/${path}`, async () => {
      calls += 1
      await pending
      return HttpResponse.json({ errors: [{ code: operation === 'redeem' ? 'INVALID_GIFT_CARD' : 'INSUFFICIENT_CREDIT', message: 'rejected' }] }, { status: 422 })
    }))
    at('/checkout')
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    if (operation === 'redeem') fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'CODE' } })
    else {
      fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
      fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    }
    fireEvent.click(screen.getByRole('button', { name: operation === 'redeem' ? 'Canjear' : 'Pagar con crédito' }))
    await waitFor(() => expect(calls).toBe(1))
    const stored = sessionStorage.getItem('checkout.credit-attempt')
    for (const token of [tokenFor('account-b'), purchaseToken]) {
      act(() => {
        sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: token }))
        window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
      })
    }
    await act(async () => { finish(); await pending })
    await waitFor(() => expect(screen.queryByRole('button', { name: operation === 'redeem' ? 'Canjeando…' : 'Procesando compra…' })).not.toBeInTheDocument())
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBe(stored)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
    expect(screen.queryByText('La gift card no se puede canjear.')).not.toBeInTheDocument()
    expect(screen.queryByText('No tenés crédito suficiente para esta compra.')).not.toBeInTheDocument()
  })

  it.each(['redeem', 'checkout'] as const)('keeps %s locked when storage cannot confirm the absence of an attempt', async (operation) => {
    at('/checkout')
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    if (operation === 'redeem') fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'CODE' } })
    else {
      fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
      fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    }
    const getItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (name) {
      if (name === 'checkout.credit-attempt') throw new DOMException('Blocked')
      return getItem.call(this, name)
    })
    fireEvent.click(screen.getByRole('button', { name: operation === 'redeem' ? 'Canjear' : 'Pagar con crédito' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/almacenamiento/i)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
  })

  it('releases a new redemption after an initial HTTP 400', async () => {
    server.use(http.post('*/api/v1/gift-cards/redeem', () => HttpResponse.json({ errors: [{ code: 'INVALID_INPUT', message: 'invalid' }] }, { status: 400 })))
    at('/checkout')
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'INVALID' } })
    fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    await screen.findByRole('alert')
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBeNull()
    expect(screen.getByLabelText('Medio de pago')).toBeEnabled()
    expect(screen.getByRole('alert')).not.toHaveTextContent('No se pudo confirmar')
  })

  it('releases a new credit checkout after an initial HTTP 400', async () => {
    server.use(http.post('*/api/v1/checkout/credit', () => HttpResponse.json({ errors: [{ code: 'ADDRESS_REQUIRED', message: 'invalid' }] }, { status: 400 })))
    at('/checkout')
    render(<App />)
    fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    expect(await screen.findByRole('alert')).not.toHaveTextContent('No se pudo confirmar')
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBeNull()
    expect(screen.getByLabelText('Medio de pago')).toBeEnabled()
  })

  it.each(['redeem', 'checkout'] as const)('blocks %s retry for another account and accepts a refreshed token for the original account', async (operation) => {
    const keys: string[] = []
    const authorizations: (string | null)[] = []
    const path = operation === 'redeem' ? 'gift-cards/redeem' : 'checkout/credit'
    server.use(http.post(`*/api/v1/${path}`, ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!)
      authorizations.push(request.headers.get('Authorization'))
      if (keys.length === 1) return HttpResponse.json({}, { status: 502 })
      return operation === 'redeem'
        ? HttpResponse.json({ balance: '100.00', currency: 'ARS' })
        : HttpResponse.json({ order: approvedOrder, credit: { balance: '0.00', currency: 'ARS' } })
    }))
    at('/checkout')
    const first = render(<App />)
    await screen.findByText(/0,00 ARS/)
    if (operation === 'redeem') {
      fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'SECRET-CODE' } })
      fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    } else {
      fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
      fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
      fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    }
    await screen.findByRole('alert')
    const stored = sessionStorage.getItem('checkout.credit-attempt')!
    expect(JSON.parse(stored)).toEqual({ operation, key: keys[0], accountId: 'account-a' })
    expect(stored).not.toContain('SECRET-CODE')
    expect(stored).not.toContain(purchaseToken)
    expect(stored).not.toContain('Calle 123')
    first.unmount()
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: tokenFor('account-b') }))
    const second = render(<App />)
    await screen.findByText(/0,00 ARS/)
    if (operation === 'redeem') fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'SECRET-CODE' } })
    else fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
    fireEvent.click(screen.getByRole('button', { name: operation === 'redeem' ? 'Reintentar canje' : 'Reintentar compra con crédito' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('cuenta actual')
    expect(keys).toHaveLength(1)
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBe(stored)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
    second.unmount()
    const refreshed = tokenFor('account-a', 'refreshed-signature')
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: refreshed }))
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    if (operation === 'redeem') fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'SECRET-CODE' } })
    else fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
    fireEvent.click(screen.getByRole('button', { name: operation === 'redeem' ? 'Reintentar canje' : 'Reintentar compra con crédito' }))
    await screen.findByText(operation === 'redeem' ? 'Gift card canjeada.' : '¡Gracias por tu compra!')
    expect(keys).toEqual([keys[0], keys[0]])
    expect(authorizations).toEqual([`Bearer ${purchaseToken}`, `Bearer ${refreshed}`])
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBeNull()
  })

  it.each(['redeem', 'checkout'] as const)('retains a recovered %s attempt after HTTP 400 and another reload', async (operation) => {
    const keys: string[] = []
    const path = operation === 'redeem' ? 'gift-cards/redeem' : 'checkout/credit'
    server.use(http.post(`*/api/v1/${path}`, ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!)
      return keys.length === 1 ? HttpResponse.json({}, { status: 502 }) : HttpResponse.json({ errors: [{ code: 'INVALID_INPUT', message: 'invalid' }] }, { status: 400 })
    }))
    at('/checkout')
    const first = render(<App />)
    await screen.findByText(/0,00 ARS/)
    if (operation === 'redeem') {
      fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'SECRET-CODE' } })
      fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    } else {
      fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
      fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
      fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    }
    await screen.findByRole('alert')
    const stored = sessionStorage.getItem('checkout.credit-attempt')
    first.unmount()
    const second = render(<App />)
    await screen.findByText(/0,00 ARS/)
    if (operation === 'redeem') fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'SECRET-CODE' } })
    else fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
    fireEvent.click(screen.getByRole('button', { name: operation === 'redeem' ? 'Reintentar canje' : 'Reintentar compra con crédito' }))
    await screen.findByRole('alert')
    expect(keys).toEqual([keys[0], keys[0]])
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBe(stored)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
    second.unmount()
    render(<App />)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBe(stored)
  })

  it.each([undefined, '', 'purchase-token', 'header.invalid*.signature', tokenFor(undefined), tokenFor(''), tokenFor(42), tokenFor(null)])('rejects invalid identity %s without altering a persisted attempt', (token) => {
    const attempt = beginCreditAttempt('redeem')
    const stored = sessionStorage.getItem('checkout.credit-attempt')
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: token }))
    expect(() => beginCreditAttempt('redeem', attempt.key)).toThrow(CreditIdentityError)
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBe(stored)
  })

  it('does not create an attempt when identity is unavailable', () => {
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    expect(() => beginCreditAttempt('redeem')).toThrow(CreditIdentityError)
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBeNull()
  })

  it('fails closed for a legacy attempt without an account id', () => {
    const stored = JSON.stringify({ operation: 'redeem', key: crypto.randomUUID() })
    sessionStorage.setItem('checkout.credit-attempt', stored)
    expect(() => beginCreditAttempt('redeem')).toThrow(CreditStorageError)
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBe(stored)
  })

  it('keeps the attempt when storage refuses to clear an initial 400', async () => {
    server.use(http.post('*/api/v1/gift-cards/redeem', () => HttpResponse.json({}, { status: 400 })))
    at('/checkout')
    const first = render(<App />)
    await screen.findByText(/0,00 ARS/)
    const removeItem = Storage.prototype.removeItem
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (name) {
      if (name === 'checkout.credit-attempt') throw new DOMException('Blocked')
      return removeItem.call(this, name)
    })
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'SECRET-CODE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/almacenamiento/i)
    const stored = sessionStorage.getItem('checkout.credit-attempt')
    expect(stored).not.toBeNull()
    first.unmount()
    render(<App />)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBe(stored)
  })

  it('does not send when storage writes a different account id', async () => {
    let calls = 0
    server.use(http.post('*/api/v1/gift-cards/redeem', () => {
      calls += 1
      return HttpResponse.json({ balance: '100.00', currency: 'ARS' })
    }))
    at('/checkout')
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    const setItem = Storage.prototype.setItem
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (name, value) {
      if (name === 'checkout.credit-attempt') {
        const attempt = JSON.parse(value) as { accountId: string }
        attempt.accountId = 'account-b'
        return setItem.call(this, name, JSON.stringify(attempt))
      }
      return setItem.call(this, name, value)
    })
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'SECRET-CODE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/almacenamiento/i)
    expect(calls).toBe(0)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
  })

  it('does not clear an attempt when the account changes while a request is in flight', async () => {
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    let calls = 0
    server.use(http.post('*/api/v1/gift-cards/redeem', async () => {
      calls += 1
      await pending
      return HttpResponse.json({ balance: '100.00', currency: 'ARS' })
    }))
    at('/checkout')
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'SECRET-CODE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    await waitFor(() => expect(calls).toBe(1))
    const stored = sessionStorage.getItem('checkout.credit-attempt')
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: tokenFor('account-b') }))
    finish()
    expect(await screen.findByRole('alert')).toHaveTextContent(/almacenamiento/i)
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBe(stored)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
  })

  it('recovers an uncertain redemption after remount without storing its code or token', async () => {
    const keys: string[] = []
    server.use(http.post('*/api/v1/gift-cards/redeem', async ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!)
      expect(await request.json()).toEqual({ code: 'SECRET-CODE' })
      return keys.length === 1
        ? HttpResponse.json({}, { status: 502 })
        : HttpResponse.json({ balance: '100.00', currency: 'ARS' })
    }))
    at('/checkout')
    const { unmount } = render(<App />)
    await screen.findByText(/0,00 ARS/)
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'SECRET-CODE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    await screen.findByRole('alert')
    const saved = Object.entries(sessionStorage).filter(([name]) => name !== SESSION_STORAGE_KEY)
    expect(JSON.stringify(saved)).not.toContain('SECRET-CODE')
    expect(JSON.stringify(saved)).not.toContain(purchaseToken)
    unmount()
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    expect(screen.getByLabelText('Código de gift card')).toHaveValue('')
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'SECRET-CODE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar canje' }))
    await screen.findByText('Gift card canjeada.')
    expect(keys).toEqual([keys[0], keys[0]])
  })

  it('recovers credit checkout after remount and keeps the key and payment lock on conflict', async () => {
    const keys: string[] = []
    server.use(http.post('*/api/v1/checkout/credit', ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!)
      return keys.length === 1
        ? HttpResponse.json({}, { status: 502 })
        : HttpResponse.json({ errors: [{ code: 'IDEMPOTENCY_CONFLICT', message: 'conflict' }] }, { status: 409 })
    }))
    at('/checkout')
    const { unmount } = render(<App />)
    fillAddress()
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    await screen.findByRole('alert')
    const saved = JSON.stringify(Object.entries(sessionStorage).filter(([name]) => name !== SESSION_STORAGE_KEY))
    expect(saved).not.toContain('Ana Pérez')
    expect(saved).not.toContain('Calle 123')
    expect(saved).not.toContain(purchaseToken)
    unmount()
    render(<App />)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
    expect(screen.getByLabelText(/Nombre de quien recibe/)).toHaveValue('')
    fillAddress()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar compra con crédito' }))
    await screen.findByRole('alert')
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar compra con crédito' }))
    await waitFor(() => expect(keys).toHaveLength(3))
    expect(keys).toEqual([keys[0], keys[0], keys[0]])
    expect(checkoutCalls).toBe(0)
  })

  it('does not send a redemption when session storage cannot persist its key', async () => {
    let calls = 0
    server.use(http.post('*/api/v1/gift-cards/redeem', () => {
      calls += 1
      return HttpResponse.json({ balance: '100.00', currency: 'ARS' })
    }))
    at('/checkout')
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked') })
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'SECRET-CODE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/almacenamiento/i)
    expect(calls).toBe(0)
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBeNull()
    expect(screen.getByLabelText('Medio de pago')).toBeEnabled()
  })

  it('blocks checkout methods when the stored attempt cannot be read on reload', async () => {
    const getItem = Storage.prototype.getItem
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(function (name) {
      if (name === 'checkout.credit-attempt') throw new DOMException('Blocked')
      return getItem.call(this, name)
    })
    at('/checkout')
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent(/almacenamiento/i)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Continuar a Mercado Pago' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Canjear' })).toBeDisabled()
  })

  it('does not send credit checkout when session storage cannot persist its key', async () => {
    let calls = 0
    server.use(http.post('*/api/v1/checkout/credit', () => {
      calls += 1
      return HttpResponse.json({ order: approvedOrder, credit: { balance: '0.00', currency: 'ARS' } })
    }))
    at('/checkout')
    render(<App />)
    fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Blocked') })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(/almacenamiento/i)
    expect(calls).toBe(0)
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBeNull()
    expect(screen.getByLabelText('Medio de pago')).toBeEnabled()
  })

  it('retains a redemption key and the payment lock after a conflict', async () => {
    const keys: string[] = []
    server.use(http.post('*/api/v1/gift-cards/redeem', ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!)
      return HttpResponse.json({ errors: [{ code: 'IDEMPOTENCY_CONFLICT', message: 'conflict' }] }, { status: 409 })
    }))
    at('/checkout')
    const { unmount } = render(<App />)
    await screen.findByText(/0,00 ARS/)
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'ORIGINAL' } })
    fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    await screen.findByRole('alert')
    const stored = JSON.stringify(Object.entries(sessionStorage).filter(([name]) => name !== SESSION_STORAGE_KEY))
    unmount()
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'ORIGINAL' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar canje' }))
    await waitFor(() => expect(keys).toHaveLength(2))
    expect(keys[1]).toBe(keys[0])
    expect(JSON.stringify(Object.entries(sessionStorage).filter(([name]) => name !== SESSION_STORAGE_KEY))).toBe(stored)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
  })

  it('does not replace an uncertain key that disappears from storage', async () => {
    let calls = 0
    server.use(http.post('*/api/v1/checkout/credit', () => {
      calls += 1
      return HttpResponse.json({}, { status: 502 })
    }))
    at('/checkout')
    render(<App />)
    fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    await screen.findByRole('alert')
    const [attemptKey] = Object.keys(sessionStorage).filter((name) => name !== SESSION_STORAGE_KEY)
    sessionStorage.removeItem(attemptKey)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar compra con crédito' }))
    expect(screen.getByRole('alert')).toHaveTextContent(/almacenamiento/i)
    expect(calls).toBe(1)
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
  })

  it.each(['INVALID', 'ADDRESS_REQUIRED'])('keeps the credit attempt locked for an ambiguous %s rejection', async (code) => {
    const keys: string[] = []
    server.use(http.post('*/api/v1/checkout/credit', ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!)
      return keys.length === 1
        ? HttpResponse.json({}, { status: 502 })
        : HttpResponse.json({ errors: [{ code, message: 'invalid' }] }, { status: 400 })
    }))
    at('/checkout')
    render(<App />)
    fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar compra con crédito' }))
    await waitFor(() => expect(keys).toHaveLength(2))
    expect(keys[1]).toBe(keys[0])
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
    expect(screen.getByLabelText('Modalidad de entrega')).toBeEnabled()
  })

  it('releases an uncertain checkout after a persisted address rejection', async () => {
    const keys: string[] = []
    server.use(http.post('*/api/v1/checkout/credit', ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!)
      return keys.length === 1
        ? HttpResponse.json({}, { status: 502 })
        : HttpResponse.json({ errors: [{ code: 'ADDRESS_REQUIRED_RECORDED', message: 'invalid' }] }, { status: 400 })
    }))
    at('/checkout')
    render(<App />)
    fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    await screen.findByRole('alert')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar compra con crédito' }))
    await waitFor(() => expect(keys).toHaveLength(2))
    await waitFor(() => expect(sessionStorage.getItem('checkout.credit-attempt')).toBeNull())
    expect(keys[1]).toBe(keys[0])
    expect(screen.getByLabelText('Medio de pago')).toBeEnabled()
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    await waitFor(() => expect(keys).toHaveLength(3))
    expect(keys[2]).not.toBe(keys[0])
  })

  it('loads the authenticated credit balance and redeems a gift card', async () => {
    server.use(
      http.get('*/api/v1/credit', ({ request }) => {
        expect(request.headers.get('Authorization')).toBe(`Bearer ${purchaseToken}`)
        return HttpResponse.json({ balance: '12500.00', currency: 'ARS' })
      }),
      http.post('*/api/v1/gift-cards/redeem', async ({ request }) => {
        expect(request.headers.get('Idempotency-Key')).toMatch(/^[0-9a-f-]{36}$/i)
        expect(await request.json()).toEqual({ code: 'GIFT-CODE' })
        return HttpResponse.json({ balance: '15000.00', currency: 'ARS' })
      }),
    )
    at('/checkout')
    render(<App />)
    expect(await screen.findByText(/12\.500,00/)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'GIFT-CODE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    expect(await screen.findByText(/15\.000,00/)).toBeInTheDocument()
    expect(screen.getByLabelText('Código de gift card')).toHaveValue('')
  })

  it('retries an uncertain redemption with the same key and prevents other checkout actions', async () => {
    const keys: string[] = []
    server.use(http.post('*/api/v1/gift-cards/redeem', ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!)
      return keys.length === 1
        ? HttpResponse.json({ error: 'Credit service unavailable' }, { status: 502 })
        : HttpResponse.json({ balance: '100.00', currency: 'ARS' } satisfies components['schemas']['CreditBalance'])
    }))
    at('/checkout')
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    const input = screen.getByLabelText('Código de gift card')
    fireEvent.change(input, { target: { value: 'SECRET-CODE' } })
    fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo confirmar')
    expect(input).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Continuar a Mercado Pago' })).toBeDisabled()
    expect(JSON.stringify(sessionStorage)).not.toContain('SECRET-CODE')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar canje' }))
    expect(await screen.findByText('Gift card canjeada.')).toBeInTheDocument()
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBe(keys[0])
  })

  it('shows an indistinguishable invalid gift card error and creates a new key for a new attempt', async () => {
    const keys: string[] = []
    server.use(http.post('*/api/v1/gift-cards/redeem', ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!)
      return HttpResponse.json({ errors: [{ code: 'INVALID_GIFT_CARD', message: 'invalid' }] }, { status: 422 })
    }))
    at('/checkout')
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    fireEvent.change(screen.getByLabelText('Código de gift card'), { target: { value: 'INVALID' } })
    fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('La gift card no se puede canjear.')
    fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    await waitFor(() => expect(keys).toHaveLength(2))
    expect(keys[1]).not.toBe(keys[0])
  })

  it('shows a balance loading error and allows retry', async () => {
    let calls = 0
    server.use(http.get('*/api/v1/credit', () => {
      calls += 1
      return calls === 1 ? HttpResponse.json({ error: 'unavailable' }, { status: 502 }) : HttpResponse.json({ balance: '0.00', currency: 'ARS' })
    }))
    at('/checkout')
    render(<App />)
    expect(screen.getByRole('status')).toHaveTextContent('Consultando saldo')
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo consultar tu saldo')
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar saldo' }))
    expect(await screen.findByText(/0,00 ARS/)).toBeInTheDocument()
  })

  it('associates an empty gift card error with the input', async () => {
    at('/checkout')
    render(<App />)
    await screen.findByText(/0,00 ARS/)
    fireEvent.click(screen.getByRole('button', { name: 'Canjear' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresá el código')
    expect(screen.getByLabelText('Código de gift card')).toHaveAttribute('aria-describedby', 'gift-card-error')
  })

  it('does not submit a credit payment twice while it is in flight', async () => {
    let calls = 0
    let finish!: () => void
    const pending = new Promise<void>((resolve) => { finish = resolve })
    server.use(http.post('*/api/v1/checkout/credit', async () => {
      calls += 1
      await pending
      return HttpResponse.json({ order: approvedOrder, credit: { balance: '0.00', currency: 'ARS' } })
    }))
    at('/checkout')
    render(<App />)
    fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    const form = screen.getByRole('button', { name: 'Pagar con crédito' }).closest('form')!
    fireEvent.submit(form)
    fireEvent.submit(form)
    expect(screen.getByRole('button', { name: 'Procesando compra…' })).toBeDisabled()
    await waitFor(() => expect(calls).toBe(1))
    finish()
    expect(await screen.findByRole('heading', { name: '¡Gracias por tu compra!' })).toBeInTheDocument()
  })

  it('retries an uncertain credit payment with the same request and opens the paid order', async () => {
    const keys: string[] = []
    const bodies: unknown[] = []
    server.use(http.post('*/api/v1/checkout/credit', async ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!)
      bodies.push(await request.json())
      expect(request.headers.get('Authorization')).toBe(`Bearer ${purchaseToken}`)
      if (keys.length === 1) return HttpResponse.json({ error: 'Credit service unavailable' }, { status: 502 })
      return HttpResponse.json({ order: approvedOrder, credit: { balance: '0.00', currency: 'ARS' } })
    }))
    at('/checkout')
    render(<App />)
    fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo confirmar')
    expect(screen.getByLabelText('Modalidad de entrega')).toBeDisabled()
    expect(screen.getByLabelText('Medio de pago')).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar compra con crédito' }))
    expect(await screen.findByRole('heading', { name: '¡Gracias por tu compra!' })).toBeInTheDocument()
    expect(keys).toHaveLength(2)
    expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/i)
    expect(keys[1]).toBe(keys[0])
    expect(bodies).toEqual([{ shipping_mode: 'pickup' }, { shipping_mode: 'pickup' }])
    expect(checkoutCalls).toBe(0)
    expect(redirectToPayment).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Ver compra y factura' }))
    expect(await screen.findByText(`Compra ${orderId}`)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Descargar factura' })).toBeInTheDocument()
  })

  it.each([
    ['INSUFFICIENT_CREDIT', 'No tenés crédito suficiente'],
    ['INSUFFICIENT_STOCK', 'No hay stock suficiente'],
    ['PENDING_PAYMENT', 'Tenés un pago de Mercado Pago pendiente'],
    ['EMPTY_CART', 'Tu carrito está vacío'],
  ])('shows credit checkout error %s and starts a fresh attempt', async (code, message) => {
    const keys: string[] = []
    server.use(http.post('*/api/v1/checkout/credit', ({ request }) => {
      keys.push(request.headers.get('Idempotency-Key')!)
      return HttpResponse.json({ errors: [{ code, message: 'detail' }] }, { status: 409 })
    }))
    at('/checkout')
    render(<App />)
    fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(message)
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    await waitFor(() => expect(keys).toHaveLength(2))
    expect(keys[1]).not.toBe(keys[0])
  })

  it('enables payment only when the selected delivery details are valid', () => {
    at('/checkout')
    render(<App />)
    const button = screen.getByRole('button', { name: 'Continuar a Mercado Pago' })
    expect(button).toBeDisabled()
    fillAddress()
    expect(button).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: '   ' } })
    expect(button).toBeDisabled()
    fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'pickup' } })
    expect(button).toBeEnabled()
    fireEvent.change(screen.getByLabelText('Modalidad de entrega'), { target: { value: 'standard' } })
    expect(button).toBeDisabled()
  })

  it('validates required shipping fields accessibly before creating checkout', async () => {
    at('/checkout')
    render(<App />)
    fireEvent.submit(screen.getByRole('button', { name: 'Continuar a Mercado Pago' }).closest('form')!)
    expect(await screen.findAllByText('Este dato es obligatorio.')).toHaveLength(4)
    expect(screen.getByLabelText(/Nombre de quien recibe/)).toHaveAttribute('aria-invalid', 'true')
    expect(checkoutCalls).toBe(0)
  })

  it.each([
    ['Nombre de quien recibe', 250], ['Calle y número', 500], ['Ciudad', 150],
    ['Código postal', 32], ['Teléfono (opcional)', 50],
  ])('rejects a shipping field above its character limit: %s', async (label, limit) => {
    at('/checkout')
    render(<App />)
    fillAddress()
    const input = screen.getByLabelText(label)
    fireEvent.change(input, { target: { value: 'x'.repeat(limit + 1) } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a Mercado Pago' }))
    expect(await screen.findByText(`No puede superar ${limit} caracteres.`)).toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(checkoutCalls).toBe(0)
  })

  it('counts Unicode characters rather than UTF-16 units for shipping limits', async () => {
    at('/checkout')
    render(<App />)
    fillAddress()
    fireEvent.change(screen.getByLabelText('Código postal'), { target: { value: '\u{1f3b2}'.repeat(32) } })
    fireEvent.click(screen.getByRole('button', { name: 'Continuar a Mercado Pago' }))
    await waitFor(() => expect(checkoutCalls).toBe(1))
  })

  it('rejects an oversized address before starting a credit attempt', async () => {
    let creditCalls = 0
    server.use(http.post('*/api/v1/checkout/credit', () => {
      creditCalls += 1
      return HttpResponse.json({})
    }))
    at('/checkout')
    render(<App />)
    fillAddress()
    fireEvent.change(screen.getByLabelText('Ciudad'), { target: { value: 'x'.repeat(151) } })
    fireEvent.change(screen.getByLabelText('Medio de pago'), { target: { value: 'credit' } })
    fireEvent.click(screen.getByRole('button', { name: 'Pagar con crédito' }))
    expect(await screen.findByText('No puede superar 150 caracteres.')).toBeInTheDocument()
    expect(creditCalls).toBe(0)
    expect(sessionStorage.getItem('checkout.credit-attempt')).toBeNull()
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

  it('advises support and no new payment when a late payment requires review', async () => {
    server.use(http.post('*/api/v1/checkout/confirm', () => HttpResponse.json({
      errors: [{ code: 'PAYMENT_REQUIRES_REVIEW', message: 'Payment requires manual review.' }],
    }, { status: 409 })))
    at(`/compra/resultado?payment_id=pay-123&external_reference=${orderId}`)
    render(<App />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu pago requiere revisión. Contactá a soporte y no vuelvas a pagar.')
    expect(screen.queryByRole('button', { name: 'Reintentar pago' })).not.toBeInTheDocument()
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

  it('blocks another retry when the provider attempt requires reconciliation', async () => {
    confirmationOrder = { ...approvedOrder, status: 'rejected', payment_status: 'rejected', invoice: null }
    server.use(http.post(`*/api/v1/orders/${orderId}/retry-payment`, () => HttpResponse.json({ errors: [{ code: 'PENDING_PAYMENT', message: 'pending' }] }, { status: 409 })))
    at(`/compra/resultado?payment_id=pay-456&external_reference=${orderId}`)
    render(<App />)
    const retry = await screen.findByRole('button', { name: 'Reintentar pago' })
    fireEvent.click(retry)
    expect(await screen.findByText('Hay un intento de pago pendiente de revisión. No inicies otro pago.')).toBeInTheDocument()
    expect(retry).toBeDisabled()
    expect(redirectToPayment).not.toHaveBeenCalled()
  })

  it('blocks another retry when an approved payment requires review', async () => {
    confirmationOrder = { ...approvedOrder, status: 'rejected', payment_status: 'rejected', invoice: null }
    server.use(http.post(`*/api/v1/orders/${orderId}/retry-payment`, () => HttpResponse.json({ errors: [{ code: 'PAYMENT_REQUIRES_REVIEW', message: 'review' }] }, { status: 409 })))
    at(`/compra/resultado?payment_id=pay-456&external_reference=${orderId}`)
    render(<App />)
    const retry = await screen.findByRole('button', { name: 'Reintentar pago' })
    fireEvent.click(retry)
    expect(await screen.findByText('Tu pago requiere revisión. Contactá a soporte y no vuelvas a pagar.')).toBeInTheDocument()
    expect(retry).toBeDisabled()
    expect(redirectToPayment).not.toHaveBeenCalled()
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
    const revokeUrl = vi.fn()
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createUrl })
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeUrl })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Descargar factura' }))
    await waitFor(() => expect(invoiceCalls).toBe(1))
    expect(createUrl).toHaveBeenCalled()
    expect(click).toHaveBeenCalled()
    await waitFor(() => expect(revokeUrl).toHaveBeenCalledWith('blob:invoice'), { timeout: 2000 })
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
