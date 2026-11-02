import { fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { components } from '../../types/generated/bff-api'
import CouponForm from './CouponForm'

type Coupon = components['schemas']['AdminCoupon']

const existingCoupon: Coupon = {
  id: 27,
  code: 'KeepCase',
  discount_percent: 15,
  remaining: 5,
  active: true,
  starts_at: null,
  ends_at: null,
  created_at: '2026-01-01T00:00:00Z',
}

let coupons: Coupon[] = []
let createPayload: unknown
let updatePayload: unknown
let updateMethod: string | undefined
let updateUrl: string | undefined

const server = setupServer(
  http.get('*/api/v1/admin/coupons', () => HttpResponse.json(coupons)),
  http.post('*/api/v1/admin/coupons', async ({ request }) => {
    createPayload = await request.json()
    return HttpResponse.json({ ...existingCoupon, id: 28 }, { status: 201 })
  }),
  http.patch('*/api/v1/admin/coupons/:coupon_id', async ({ request }) => {
    updatePayload = await request.json()
    updateMethod = request.method
    updateUrl = new URL(request.url).pathname
    return HttpResponse.json(existingCoupon)
  }),
)

beforeAll(() => server.listen())
beforeEach(() => {
  coupons = []
  createPayload = undefined
  updatePayload = undefined
  updateMethod = undefined
  updateUrl = undefined
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'admin-token' }))
  window.history.replaceState({}, '', '/admin/coupons/new')
})
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
})
afterAll(() => server.close())

describe('CouponForm', () => {
  it('shows an explicit loading error when an edit coupon cannot be loaded', async () => {
    window.history.replaceState({}, '', '/admin/coupons/27')
    server.use(http.get('*/api/v1/admin/coupons', () => HttpResponse.json({}, { status: 403 })))
    render(<CouponForm />)

    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permisos para administrar cupones.')
  })

  it('creates a case-sensitive code with an explicit inactive value and nullable dates', async () => {
    render(<CouponForm />)

    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'SaveMeCaseSensitive' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Usos restantes'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('El cupón se guardó correctamente.')
    expect(createPayload).toEqual({
      code: 'SaveMeCaseSensitive',
      discount_percent: 0,
      remaining: 0,
      active: false,
      starts_at: null,
      ends_at: null,
    })
  })

  it.each(['0', '50'])('accepts discount boundary %s%%', async (value) => {
    render(<CouponForm />)
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'Limit' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value } })
    fireEvent.change(screen.getByLabelText('Usos restantes'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('El cupón se guardó correctamente.')
    expect(createPayload).toMatchObject({ discount_percent: Number(value) })
  })

  it.each(['-0.01', '50.01'])('rejects discount outside the allowed range: %s', async (value) => {
    render(<CouponForm />)
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'InvalidDiscount' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value } })
    fireEvent.change(screen.getByLabelText('Usos restantes'), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El descuento debe estar entre 0% y 50%, inclusive.')).toBeInTheDocument()
    expect(createPayload).toBeUndefined()
  })

  it.each(['-1', '1.5'])('rejects invalid remaining uses: %s', async (value) => {
    render(<CouponForm />)
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'InvalidRemaining' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Usos restantes'), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('Los usos restantes deben ser un número entero igual o mayor que cero.')).toBeInTheDocument()
    expect(createPayload).toBeUndefined()
  })

  it('rejects a validity range whose start is not before its end', async () => {
    render(<CouponForm />)
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'InvalidRange' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Usos restantes'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Válido desde'), { target: { value: '2027-03-02T10:00' } })
    fireEvent.change(screen.getByLabelText('Válido hasta'), { target: { value: '2027-03-02T10:00' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('La fecha de inicio debe ser anterior a la fecha de fin.')).toBeInTheDocument()
    expect(createPayload).toBeUndefined()
  })

  it('shows an explicit conflict error when a code is already taken', async () => {
    server.use(http.post('*/api/v1/admin/coupons', () => HttpResponse.json({}, { status: 409 })))
    render(<CouponForm />)
    fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'Duplicate' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.change(screen.getByLabelText('Usos restantes'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Ya existe un cupón con ese código.')
  })

  it('sends only changed fields with PATCH and keeps the code immutable', async () => {
    coupons = [existingCoupon]
    window.history.replaceState({}, '', '/admin/coupons/27')
    render(<CouponForm />)

    const code = await screen.findByLabelText('Código')
    expect(code).toHaveAttribute('readonly')
    expect(code).toHaveValue('KeepCase')
    fireEvent.change(screen.getByLabelText('Usos restantes'), { target: { value: '2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('El cupón se guardó correctamente.')
    expect(updateMethod).toBe('PATCH')
    expect(updateUrl).toBe('/api/v1/admin/coupons/27')
    expect(updatePayload).toEqual({ remaining: 2 })
  })

  it('deactivates an existing coupon instead of deleting it', async () => {
    coupons = [existingCoupon]
    window.history.replaceState({}, '', '/admin/coupons/27')
    render(<CouponForm />)

    fireEvent.click(await screen.findByRole('checkbox', { name: 'Activo' }))
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByRole('status')).toHaveTextContent('El cupón se guardó correctamente.')
    expect(updatePayload).toEqual({ active: false })
  })
})
