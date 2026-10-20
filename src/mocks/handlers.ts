import { http, HttpResponse } from 'msw'
import type { components } from '../types/generated/bff-api'

type ProductPage = components['schemas']['ProductPage']
type CartResponse = components['schemas']['CartResponse']

const emptyPage: ProductPage = {
  items: [],
  page: 1,
  page_size: 20,
  total: 0,
  total_pages: 0,
}

const emptyCart: CartResponse = { lines: [], total: 0, warnings: [] }

export const handlers = [
  http.get('*/api/v1/products', () => HttpResponse.json(emptyPage)),
  http.get('*/api/v1/cart', () => HttpResponse.json(emptyCart)),
  http.post('*/api/v1/cart/items', () => HttpResponse.json(emptyCart)),
  http.patch('*/api/v1/cart/items/:bgg_id', () => HttpResponse.json(emptyCart)),
  http.delete('*/api/v1/cart/items/:bgg_id', () => HttpResponse.json(emptyCart)),
]
