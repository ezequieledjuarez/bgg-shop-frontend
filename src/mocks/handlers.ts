import { http, HttpResponse } from 'msw'
import type { components } from '../types/generated/bff-api'

type ProductPage = components['schemas']['ProductPage']

const emptyPage: ProductPage = {
  items: [],
  page: 1,
  page_size: 20,
  total: 0,
  total_pages: 0,
}

export const handlers = [
  http.get('*/api/v1/products', () => HttpResponse.json(emptyPage)),
]
