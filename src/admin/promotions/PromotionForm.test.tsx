import { fireEvent, render, screen } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { components } from '../../types/generated/bff-api'
import PromotionForm from './PromotionForm'

type Promotion = components['schemas']['AdminPromotion']
type Product = components['schemas']['Product']
type ProductPage = components['schemas']['AdminProductPage']
type AdminPromotionSummary = components['schemas']['AdminPromotionSummary']

const product: Product = {
  bgg_id: 123,
  name: 'Watergate',
  release_year: 2019,
  min_players: 2,
  max_players: 2,
  playing_time_minutes: 60,
  min_age: 12,
  weight: 2.25,
  category: ['Estrategia'],
  price: 90000,
  quantity: 3,
  publisher: 'Salt & Pepper Games',
  image_url: '/watergate.webp',
}

const productPage: ProductPage = { items: [product], page: 1, page_size: 100, total: 1, total_pages: 1 }
const promotion: Promotion = {
  id: 'promo-1',
  name: 'Oferta de verano',
  discount_percent: 20,
  product_bgg_id: 123,
  active: false,
}

let promotions: Promotion[] = []
let createPayload: unknown
let updatePayload: unknown
const created: AdminPromotionSummary = { id: 'promo-created', name: 'Nueva promo' }
const server = setupServer(
  http.get('*/api/v1/admin/products', () => HttpResponse.json(productPage)),
  http.get('*/api/v1/admin/promotions', () => HttpResponse.json(promotions)),
  http.post('*/api/v1/admin/promotions', async ({ request }) => {
    createPayload = await request.json()
    return HttpResponse.json(created, { status: 201 })
  }),
  http.put('*/api/v1/admin/promotions/:promotion_id', async ({ request }) => {
    updatePayload = await request.json()
    return HttpResponse.json({ id: promotion.id, name: promotion.name })
  }),
)

beforeAll(() => server.listen())
beforeEach(() => {
  promotions = []
  createPayload = undefined
  updatePayload = undefined
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'admin-token' }))
  window.history.replaceState({}, '', '/admin/promociones/nueva')
})
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
})
afterAll(() => server.close())

describe('PromotionForm', () => {
  it('previews the selected product price after applying the promotion percentage', async () => {
    render(<PromotionForm />)

    fireEvent.change(await screen.findByLabelText('Producto'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })

    expect(await screen.findByText(/Precio estimado con descuento:/)).toHaveTextContent('81.000')
    expect(screen.getByText(/Precio actual:/)).toHaveTextContent('90.000')
  })

  it('associates a product and sends an explicit active value when creating', async () => {
    render(<PromotionForm />)

    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Promo de verano' } })
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('La promoción se guardó correctamente.')).toBeInTheDocument()
    expect(createPayload).toEqual({
      name: 'Promo de verano',
      discount_percent: 10,
      product_bgg_id: 123,
      active: false,
    })
  })

  it.each(['0', '50'])('accepts the inclusive discount boundary %s%%', async (value) => {
    render(<PromotionForm />)
    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Promo límite' } })
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('La promoción se guardó correctamente.')).toBeInTheDocument()
    expect(createPayload).toMatchObject({ discount_percent: Number(value) })
  })

  it.each(['-0.01', '50.01'])('rejects a discount outside the allowed range: %s', async (value) => {
    render(<PromotionForm />)
    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Promo inválida' } })
    fireEvent.change(screen.getByLabelText('Producto'), { target: { value: '123' } })
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El descuento debe estar entre 0% y 50%, inclusive.')).toBeInTheDocument()
    expect(createPayload).toBeUndefined()
  })

  it('creates a global promotion with a null product and no price preview', async () => {
    render(<PromotionForm />)

    fireEvent.change(await screen.findByLabelText('Nombre'), { target: { value: 'Promo global' } })
    expect(screen.getByLabelText('Producto')).toHaveValue('')
    expect(screen.getByRole('option', { name: 'Todos los productos' })).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Descuento (%)'), { target: { value: '10' } })
    expect(screen.queryByText(/Precio estimado con descuento:/)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('La promoción se guardó correctamente.')).toBeInTheDocument()
    expect(createPayload).toEqual({ name: 'Promo global', discount_percent: 10, product_bgg_id: null, active: false })
  })

  it('clears the product of an existing promotion when switching it to global', async () => {
    promotions = [promotion]
    window.history.replaceState({}, '', '/admin/promociones/promo-1')
    render(<PromotionForm />)

    fireEvent.change(await screen.findByLabelText('Producto'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('La promoción se guardó correctamente.')).toBeInTheDocument()
    expect(updatePayload).toEqual({ product_bgg_id: null })
  })

  it('requires a name and discount but not a product', async () => {
    render(<PromotionForm />)
    fireEvent.click(await screen.findByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('El nombre es obligatorio.')).toBeInTheDocument()
    expect(screen.queryByText('Seleccioná un producto válido.')).not.toBeInTheDocument()
    expect(screen.getByText('El descuento debe estar entre 0% y 50%, inclusive.')).toBeInTheDocument()
    expect(createPayload).toBeUndefined()
  })

  it('sends only edited fields when updating a promotion', async () => {
    promotions = [promotion]
    window.history.replaceState({}, '', '/admin/promociones/promo-1')
    render(<PromotionForm />)

    const activeCheckbox = await screen.findByRole('checkbox', { name: 'Activa' })
    fireEvent.click(activeCheckbox)
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }))

    expect(await screen.findByText('La promoción se guardó correctamente.')).toBeInTheDocument()
    expect(updatePayload).toEqual({ active: true })
  })
})
