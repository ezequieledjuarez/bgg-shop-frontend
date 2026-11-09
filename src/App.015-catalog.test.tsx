import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const products = [
  { bgg_id: 1, name: 'Watergate', release_year: 2019, min_players: 2, max_players: 2, playing_time_minutes: 60, min_age: 12, weight: 2, category: ['Strategy'], price: 90, quantity: 0, publisher: 'Asmodee', image_url: '/one.jpg' },
  { bgg_id: 2, name: 'Asmodee Puzzle', release_year: 2019, min_players: 2, max_players: 4, playing_time_minutes: 60, min_age: 12, weight: 2, category: ['Strategy'], price: 80, quantity: 2, publisher: 'Other Publisher', image_url: '/two.jpg' },
  { bgg_id: 3, name: 'Black Angel', release_year: 2020, min_players: 1, max_players: 4, playing_time_minutes: 120, min_age: 12, weight: 3, category: ['Thematic'], price: 180, quantity: 1, publisher: 'Asmodee', image_url: '/three.jpg' },
]

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setLocation(path: string, state: unknown = {}) {
  window.history.replaceState(state, '', path)
}

beforeEach(() => {
  setLocation('/')
  sessionStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(input.toString(), 'http://localhost')
    if (url.pathname.endsWith('/product-categories')) {
      return response(['Strategy', 'Thematic'])
    }
    if (url.pathname.endsWith('/product-publishers')) {
      return response([
        { publisher: 'Asmodee', product_count: 2 },
        { publisher: 'Other Publisher', product_count: 1 },
      ])
    }
    const publisher = url.searchParams.get('publisher')
    const search = url.searchParams.get('search')?.toLowerCase()
    const category = url.searchParams.get('category_name')
    const items = products.filter((product) =>
      (!publisher || product.publisher === publisher)
      && (!search || product.name.toLowerCase().includes(search) || product.publisher.toLowerCase().includes(search))
      && (!category || product.category.includes(category)),
    )
    return response({
      items,
      page: Number(url.searchParams.get('page') ?? 1),
      page_size: 100,
      total: items.length,
      total_pages: items.length ? 1 : 0,
    })
  }))
})

describe('feature 015 storefront catalog', () => {
  it('keeps the home selection bounded and routes catalog calls to the canonical page', async () => {
    render(<App />)

    expect(await screen.findAllByRole('article')).toHaveLength(3)
    expect(screen.getByRole('link', { name: 'Catálogo' })).toHaveAttribute('href', '/catalogo')
    expect(screen.getByRole('link', { name: /ver todo/i })).toHaveAttribute('href', '/catalogo')
    expect(screen.getByRole('link', { name: /explorar catálogo/i })).toHaveAttribute('href', '/catalogo')
    await waitFor(() => {
      const request = vi.mocked(fetch).mock.calls
        .map(([input]) => new URL(String(input), 'http://localhost'))
        .find((url) => url.pathname.endsWith('/products'))
      expect(request?.searchParams.get('page_size')).toBe('8')
    })
    fireEvent.click(screen.getByRole('link', { name: 'Catálogo' }))
    await waitFor(() => expect(window.location.pathname).toBe('/catalogo'))
    expect(await screen.findByRole('heading', { name: 'Catálogo completo' })).toBeVisible()
  })

  it('loads global facets and restores exact URL filters on the catalog route', async () => {
    const historyState = { source: 'legacy-catalog-link' }
    setLocation('/catalogo?publisher=Asmodee&search=Watergate&category_name=Strategy&page=3#juegos', historyState)
    render(<App />)

    const publisher = await screen.findByRole('combobox', { name: /editorial/i })
    expect(within(publisher).getByRole('option', { name: /Asmodee.*2/ })).toBeInTheDocument()
    expect(publisher).toHaveValue('Asmodee')
    expect(screen.getByRole('searchbox', { name: /nombre o editorial/i })).toHaveValue('Watergate')
    expect(screen.getByRole('combobox', { name: /categoría/i })).toHaveValue('Strategy')
    await waitFor(() => {
      expect(window.location.pathname + window.location.search + window.location.hash).toBe(
        '/catalogo?busqueda=Watergate&categoria=Strategy&editorial=Asmodee#juegos',
      )
    })
    expect(window.history.state).toEqual(historyState)
    await waitFor(() => {
      const productRequests = vi.mocked(fetch).mock.calls
        .map(([input]) => new URL(String(input), 'http://localhost'))
        .filter((url) => url.pathname.endsWith('/products'))
      expect(productRequests.at(-1)?.searchParams.get('publisher')).toBe('Asmodee')
      expect(productRequests.at(-1)?.searchParams.get('search')).toBe('Watergate')
      expect(productRequests.at(-1)?.searchParams.get('category_name')).toBe('Strategy')
    })
    const facetRequest = vi.mocked(fetch).mock.calls
      .map(([input]) => new URL(String(input), 'http://localhost'))
      .find((url) => url.pathname.endsWith('/product-publishers'))
    expect(facetRequest?.search).toBe('')
  })

  it('restores a canonical Spanish link without changing the English API query contract', async () => {
    setLocation(
      '/catalogo?busqueda=Watergate&categoria=Strategy&editorial=Asmodee&anio=2019'
      + '&jugadores_min=2&jugadores_max=4&precio_min=10&precio_max=100'
      + '&pagina=1&orden=precio-descendente',
    )
    render(<App />)

    expect(await screen.findByRole('combobox', { name: /editorial/i })).toHaveValue('Asmodee')
    expect(screen.getByRole('searchbox', { name: /nombre o editorial/i })).toHaveValue('Watergate')
    expect(screen.getByRole('combobox', { name: /categoría/i })).toHaveValue('Strategy')
    await waitFor(() => {
      const request = vi.mocked(fetch).mock.calls
        .map(([input]) => new URL(String(input), 'http://localhost'))
        .find((url) => url.pathname.endsWith('/products'))
      expect(request?.searchParams.get('search')).toBe('Watergate')
      expect(request?.searchParams.get('category_name')).toBe('Strategy')
      expect(request?.searchParams.get('publisher')).toBe('Asmodee')
      expect(request?.searchParams.get('year_published')).toBe('2019')
      expect(request?.searchParams.get('min_players')).toBe('2')
      expect(request?.searchParams.get('max_players')).toBe('4')
      expect(request?.searchParams.get('price_min')).toBe('10')
      expect(request?.searchParams.get('price_max')).toBe('100')
      expect(request?.searchParams.has('busqueda')).toBe(false)
      expect(request?.searchParams.has('orden')).toBe(false)
    })
    expect(new URL(window.location.href).searchParams.get('orden')).toBe('precio-descendente')
    expect(vi.mocked(fetch).mock.calls
      .map(([input]) => new URL(String(input), 'http://localhost'))
      .filter((url) => url.pathname.endsWith('/products'))).toHaveLength(1)
  })

  it('resets pagination when a filter changes and restores state on browser history', async () => {
    setLocation('/catalogo?page=3')
    render(<App />)

    const publisher = await screen.findByRole('combobox', { name: /editorial/i })
    fireEvent.change(publisher, { target: { value: 'Asmodee' } })
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get('editorial')).toBe('Asmodee')
      expect(new URL(window.location.href).searchParams.has('pagina')).toBe(false)
    })

    const historyState = { source: 'old-history-entry' }
    window.history.pushState(historyState, '', '/catalogo?publisher=Other+Publisher#facets')
    fireEvent.popState(window)
    await waitFor(() => {
      expect(publisher).toHaveValue('Other Publisher')
      expect(window.location.pathname + window.location.search + window.location.hash)
        .toBe('/catalogo?editorial=Other+Publisher#facets')
    })
    expect(window.history.state).toEqual(historyState)
  })

  it('validates unknown canonical categories and resets their page safely', async () => {
    setLocation('/catalogo?categoria=Missing&page=4')
    render(<App />)

    expect(await screen.findByRole('status')).toHaveTextContent(/categoría del enlace no está disponible/i)
    expect(screen.getByRole('combobox', { name: /categoría/i })).toHaveValue('')
    await waitFor(() => {
      expect(window.location.pathname + window.location.search).toBe('/catalogo')
    })
  })

  it('validates unknown canonical publishers and resets their page safely', async () => {
    setLocation('/catalogo?editorial=Missing&page=4')
    render(<App />)

    expect(await screen.findByRole('status')).toHaveTextContent(/editorial del enlace no está disponible/i)
    expect(screen.getByRole('combobox', { name: /editorial/i })).toHaveValue('')
    await waitFor(() => {
      expect(window.location.pathname + window.location.search).toBe('/catalogo')
    })
  })

  it('writes Spanish sort values while sorting visible products in the selected direction', async () => {
    setLocation('/catalogo')
    render(<App />)

    const articles = await screen.findAllByRole('article')
    const sort = screen.getByRole('combobox', { name: /ordenar productos/i })
    fireEvent.change(sort, { target: { value: 'price-high' } })
    await waitFor(() => {
      expect(new URL(window.location.href).searchParams.get('orden')).toBe('precio-descendente')
    })
    let displayedProducts = within(screen.getByRole('main')).getAllByRole('article')
    expect(articles).toHaveLength(3)
    expect(displayedProducts[0]).toHaveTextContent('Black Angel')
    expect(displayedProducts.at(-1)).toHaveTextContent('Asmodee Puzzle')
    fireEvent.change(sort, { target: { value: 'price-low' } })
    await waitFor(() => expect(new URL(window.location.href).searchParams.get('orden')).toBe('precio-ascendente'))
    displayedProducts = within(screen.getByRole('main')).getAllByRole('article')
    expect(displayedProducts[0]).toHaveTextContent('Asmodee Puzzle')
    expect(displayedProducts.at(-1)).toHaveTextContent('Black Angel')
  })

  it('shows and retries the publisher-facet error independently of product and category requests', async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!
    let attempts = 0
    vi.mocked(fetch).mockImplementation((input, init) => {
      if (String(input).includes('/product-publishers') && attempts++ === 0) {
        return Promise.reject(new Error('synthetic unavailable'))
      }
      return originalFetch(input, init)
    })
    setLocation('/catalogo')
    render(<App />)

    expect(await screen.findByText(/no se pudieron cargar las editoriales/i)).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: /reintentar editoriales/i }))
    expect(await screen.findByRole('option', { name: /Asmodee.*2/ })).toBeInTheDocument()
    expect(screen.queryByText(/no se pudieron cargar las editoriales/i)).not.toBeInTheDocument()
  })
})
