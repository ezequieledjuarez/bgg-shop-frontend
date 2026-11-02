import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { components } from '../../types/generated/bff-api'
import ProductsList from './ProductsList'

type ProductPage = components['schemas']['AdminProductPage']

function productPage(
  items: Array<{
    bgg_id: number
    name: string
    price: number
    quantity: number
  }> = [],
  page = 1,
  totalPages = items.length === 0 ? 0 : 1,
  total = items.length,
): ProductPage {
  return {
    items: items.map((item) => ({
      ...item,
      release_year: 2020,
      min_players: 2,
      max_players: 4,
      playing_time_minutes: 60,
      min_age: 8,
      weight: 1.5,
      category: [],
      publisher: 'Synthetic publisher',
      image_url: '/media/synthetic.webp',
    })),
    page,
    page_size: 50,
    total,
    total_pages: totalPages,
  }
}

describe('ProductsList', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    vi.restoreAllMocks()
    vi.unstubAllEnvs()
  })

  it('shows loading, error, and empty states explicitly', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'synthetic-token' }))
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(productPage()), { status: 200 }),
    )
    render(<ProductsList />)
    expect(await screen.findByText('No se encontraron productos.')).toBeInTheDocument()

    cleanup()
    vi.restoreAllMocks()
    vi.spyOn(globalThis, 'fetch').mockRejectedValueOnce(new Error('synthetic network failure'))
    render(<ProductsList />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar la lista de productos')
    expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument()
  })

  it('keeps the loading state while the list request is pending', () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'synthetic-token' }))
    vi.spyOn(globalThis, 'fetch').mockImplementation(() => new Promise<Response>(() => {}))
    render(<ProductsList />)
    expect(screen.getByRole('status')).toHaveTextContent('Cargando productos')
  })

  it('uses the operation key without exposing the stored session token', async () => {
    vi.stubEnv('VITE_USE_OPKEY', 'true')
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({
      access_token: 'synthetic-private-token',
      op_key: 'synthetic-op-key',
      op_key_expires_at: '2099-01-01T00:00:00Z',
      ops: ['GET:/api/v1/admin/*'],
    }))
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(productPage()), { status: 200 }),
    )

    render(<ProductsList />)
    await screen.findByText('No se encontraron productos.')

    const headers = new Headers(request.mock.calls[0][1]?.headers)
    expect(headers.get('X-Op-Key')).toBe('synthetic-op-key')
    expect(headers.get('Authorization')).toBeNull()
    expect(info).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain('synthetic-private-token')
  })

  it.each(['success', 'failure'] as const)('uses session authentication without logging its token on %s', async (outcome) => {
    const token = 'synthetic-private-token'
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: token }))
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const request = vi.spyOn(globalThis, 'fetch')
    if (outcome === 'success') {
      request.mockResolvedValueOnce(new Response(JSON.stringify(productPage()), { status: 200 }))
    } else {
      request.mockRejectedValueOnce(new Error(token))
    }

    render(<ProductsList />)
    if (outcome === 'success') {
      await screen.findByText('No se encontraron productos.')
    } else {
      await screen.findByRole('alert')
    }

    const headers = new Headers(request.mock.calls[0][1]?.headers)
    expect(headers.get('Authorization')).toBe(`Bearer ${token}`)
    expect(info).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain(token)
  })

  it('submits the supported search and filter parameters, then requests the next page', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'synthetic-token' }))
    const request = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(productPage()), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(productPage(
        [{ bgg_id: 12345, name: 'Synthetic game', price: 10, quantity: 2 }],
        1,
        2,
        2,
      )), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify(productPage(
        [{ bgg_id: 67890, name: 'Another game', price: 20, quantity: 1 }],
        2,
        2,
        2,
      )), { status: 200 }))

    render(<ProductsList />)
    await screen.findByText('No se encontraron productos.')
    fireEvent.change(screen.getByLabelText('Buscar por nombre o editorial'), {
      target: { value: 'Catan' },
    })
    fireEvent.change(screen.getByLabelText('Año de publicación'), { target: { value: '1995' } })
    fireEvent.change(screen.getByLabelText('Mínimo de jugadores'), { target: { value: '2' } })
    fireEvent.change(screen.getByLabelText('Máximo de jugadores'), { target: { value: '4' } })
    fireEvent.change(screen.getByLabelText('Categoría (ID)'), { target: { value: '1' } })
    fireEvent.change(screen.getByLabelText('Precio mínimo'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Precio máximo'), { target: { value: '100' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    expect(await screen.findByText('Synthetic game')).toBeInTheDocument()
    const filteredUrl = new URL(String(request.mock.calls[1][0]))
    expect(filteredUrl.pathname).toBe('/api/v1/admin/products')
    expect(filteredUrl.searchParams.get('page')).toBe('1')
    expect(filteredUrl.searchParams.get('page_size')).toBe('50')
    expect(filteredUrl.searchParams.get('search')).toBe('Catan')
    expect(filteredUrl.searchParams.get('year_published')).toBe('1995')
    expect(filteredUrl.searchParams.get('min_players')).toBe('2')
    expect(filteredUrl.searchParams.get('max_players')).toBe('4')
    expect(filteredUrl.searchParams.get('category_id')).toBe('1')
    expect(filteredUrl.searchParams.get('price_min')).toBe('0')
    expect(filteredUrl.searchParams.get('price_max')).toBe('100')

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente' }))
    expect(await screen.findByText('Another game')).toBeInTheDocument()
    await waitFor(() => expect(request).toHaveBeenCalledTimes(3))
    const nextPageUrl = new URL(String(request.mock.calls[2][0]))
    expect(nextPageUrl.searchParams.get('page')).toBe('2')
    expect(nextPageUrl.searchParams.get('page_size')).toBe('50')
  })

  it('links to edit using the product BGG identifier', async () => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'synthetic-token' }))
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(JSON.stringify(productPage(
      [{ bgg_id: 12345, name: 'Synthetic game', price: 10, quantity: 2 }],
    )), { status: 200 }))

    render(<ProductsList />)
    expect(await screen.findByRole('link', { name: 'Editar' }))
      .toHaveAttribute('href', '/admin/products/12345')
    expect(screen.getByRole('link', { name: 'Crear producto' }))
      .toHaveAttribute('href', '/admin/products/new')
  })
})
