import { rest } from 'msw'
import products from '../fixtures/products.json'
import promotions from '../fixtures/promotions.json'

const API_BASE = process.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'

export const handlers = [
  rest.get(`${API_BASE}/admin/products`, (req, res, ctx) => {
    return res(ctx.status(200), ctx.json(products))
  }),

  rest.post(`${API_BASE}/admin/products`, async (req, res, ctx) => {
    const body = await req.json()
    if (!body.name) {
      return res(ctx.status(400), ctx.json({ errors: [{ field: 'name', message: 'Name is required' }] }))
    }
    // fake create
    return res(ctx.status(201), ctx.json({ id: 'prod-new', ...body }))
  }),

  rest.get(`${API_BASE}/admin/promotions`, (req, res, ctx) => {
    return res(ctx.status(200), ctx.json(promotions))
  }),

  rest.post(`${API_BASE}/admin/promotions`, async (req, res, ctx) => {
    const body = await req.json()
    if (!body.title) {
      return res(ctx.status(400), ctx.json({ errors: [{ field: 'title', message: 'Title is required' }] }))
    }
    return res(ctx.status(201), ctx.json({ id: 'promo-new', ...body }))
  }),
]
