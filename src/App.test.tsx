import { render } from '@testing-library/react'
import { fireEvent, screen, waitFor, within } from '@testing-library/dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import type { components } from './types/generated/bff-api'

const products: components['schemas']['Product'][] = [
  { bgg_id: 1, name: 'Watergate', release_year: 2019, min_players: 2, max_players: 2, playing_time_minutes: 60, min_age: 12, weight: 2.25, category: ['Juegos de Estrategia'], price: 90000, quantity: 10, publisher: 'Salt & Pepper Games', image_url: '/watergate.webp' },
  { bgg_id: 2, name: 'Black Angel', release_year: 2019, min_players: 1, max_players: 4, playing_time_minutes: 120, min_age: 12, weight: 3.82, category: ['Juegos de Estrategia'], price: 186000, quantity: 10, publisher: 'Asmodee Pearl Games', image_url: '/black-angel.webp' },
  { bgg_id: 3, name: 'Pequeñas Grandes Tácticas', release_year: 2019, min_players: 1, max_players: 4, playing_time_minutes: 60, min_age: 14, weight: 0.24, category: ['Juegos de Estrategia'], price: 101800, quantity: 10, publisher: 'Devir', image_url: '/tacticas.webp' },
  { bgg_id: 4, name: "Aeon's End: Legacy", release_year: 2019, min_players: 1, max_players: 4, playing_time_minutes: 90, min_age: 14, weight: 2.84, category: ['Juegos de Estrategia', 'Juegos Temáticos'], price: 181500, quantity: 10, publisher: 'SD Games', image_url: '/aeons-end.webp' },
]

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = new URL(input.toString(), 'http://localhost')
    if (url.pathname.endsWith('/product-categories')) {
      return Promise.resolve(new Response(JSON.stringify([
        'Juegos de Estrategia', 'Juegos Temáticos', 'Juegos Familiares', 'Juegos Party', 'Nueva categoría',
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    }
    const search = url.searchParams.get('search')
    const categoryName = url.searchParams.get('category_name')
    const items = search?.toLocaleLowerCase() === 'inexistente'
      ? []
      : products.filter((product) => !categoryName || product.category.includes(categoryName))
    return Promise.resolve(new Response(JSON.stringify({
      items,
      page: 1,
      page_size: 100,
      total: items.length,
      total_pages: items.length ? 1 : 0,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }))
})

describe('Home', () => {
  it('renders the catalog and accessible controls', async () => {
    render(<App />)
    expect(await screen.findAllByRole('article')).toHaveLength(4)
    expect(screen.getByRole('banner')).toBeVisible()
    expect(screen.getByRole('main')).toBeVisible()
    expect(screen.getByRole('contentinfo')).toBeVisible()
    expect(screen.getByRole('searchbox', { name: /nombre o editorial/i })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Ordenar productos' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'Todos' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Juegos de Estrategia' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Juegos Temáticos' })).not.toBeInTheDocument()
  })

  it('waits for explicit search submission before calling the BFF', async () => {
    render(<App />)
    await screen.findAllByRole('article')
    const searchInput = screen.getByRole('searchbox', { name: /nombre o editorial/i })
    const initialCallCount = vi.mocked(fetch).mock.calls.length
    fireEvent.change(searchInput, { target: { value: 'Devir' } })
    expect(vi.mocked(fetch).mock.calls).toHaveLength(initialCallCount)
    fireEvent.submit(screen.getByRole('search'))
    fireEvent.change(screen.getByRole('spinbutton', { name: /año/i }), { target: { value: '2019' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /mínimo de jugadores/i }), { target: { value: '2' } })
    await screen.findByText('4 resultados')
    const calls = vi.mocked(fetch).mock.calls
    const lastUrl = new URL(String(calls.at(-1)?.[0]), 'http://localhost')
    expect(lastUrl.searchParams.get('search')).toBe('Devir')
    expect(lastUrl.searchParams.get('year_published')).toBe('2019')
    expect(lastUrl.searchParams.get('min_players')).toBe('2')
  })

  it('filters by category alongside other criteria and clears it', async () => {
    render(<App />)
    await screen.findAllByRole('article')

    fireEvent.change(screen.getByRole('spinbutton', { name: /año/i }), { target: { value: '2019' } })
    const category = screen.getByRole('combobox', { name: /categoría/i })
    await screen.findByRole('option', { name: 'Nueva categoría' })
    expect(within(category).getByRole('option', { name: 'Juegos Party' })).toHaveValue('Juegos Party')
    fireEvent.change(category, { target: { value: 'Juegos Temáticos' } })

    await waitFor(() => {
      const lastUrl = new URL(String(vi.mocked(fetch).mock.calls.at(-1)?.[0]), 'http://localhost')
      expect(lastUrl.searchParams.get('category_name')).toBe('Juegos Temáticos')
      expect(lastUrl.searchParams.get('year_published')).toBe('2019')
    })
    expect(await screen.findAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: "Aeon's End: Legacy" })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /limpiar filtros/i }))
    await waitFor(() => {
      const lastUrl = new URL(String(vi.mocked(fetch).mock.calls.at(-1)?.[0]), 'http://localhost')
      expect(lastUrl.searchParams.has('category_name')).toBe(false)
      expect(lastUrl.searchParams.has('year_published')).toBe(false)
    })
    expect(category).toHaveValue('')
    expect(await screen.findAllByRole('article')).toHaveLength(4)
  })

  it('allows retrying when category loading fails', async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!
    let categoryAttempts = 0
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = new URL(input.toString(), 'http://localhost')
      if (url.pathname.endsWith('/product-categories') && categoryAttempts++ === 0) {
        return Promise.reject(new Error('BFF unavailable'))
      }
      return originalFetch(input, init)
    })

    render(<App />)
    expect(await screen.findByText('No se pudieron cargar las categorías.')).toBeVisible()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar categorías' }))
    expect(await screen.findByRole('option', { name: 'Juegos Party' })).toBeInTheDocument()
    expect(screen.queryByText('No se pudieron cargar las categorías.')).not.toBeInTheDocument()
  })

  it('navigates pages and returns to the first page when filters change', async () => {
    const originalFetch = vi.mocked(fetch).getMockImplementation()!
    vi.mocked(fetch).mockImplementation((input, init) => {
      const url = new URL(input.toString(), 'http://localhost')
      if (url.pathname.endsWith('/product-categories')) return originalFetch(input, init)
      const page = Number(url.searchParams.get('page'))
      const items = page === 1 ? products.slice(0, 2) : products.slice(2)
      return Promise.resolve(new Response(JSON.stringify({
        items, page, page_size: 2, total: 4, total_pages: 2,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
    })

    render(<App />)
    expect(await screen.findByRole('heading', { name: 'Watergate' })).toBeVisible()
    expect(screen.getByText('Página 1 de 2')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Página anterior' })).toBeDisabled()
    fireEvent.click(screen.getByRole('button', { name: 'Página siguiente' }))
    expect(await screen.findByRole('heading', { name: 'Pequeñas Grandes Tácticas' })).toBeVisible()
    expect(screen.getByText('Página 2 de 2')).toBeVisible()
    expect(screen.getByRole('button', { name: 'Página siguiente' })).toBeDisabled()
    fireEvent.change(screen.getByRole('spinbutton', { name: /año/i }), { target: { value: '2019' } })
    expect(await screen.findByRole('heading', { name: 'Watergate' })).toBeVisible()
    const lastUrl = new URL(String(vi.mocked(fetch).mock.calls.at(-1)?.[0]), 'http://localhost')
    expect(lastUrl.searchParams.get('page')).toBe('1')
    expect(lastUrl.searchParams.get('year_published')).toBe('2019')
  })

  it('explains invalid ranges and hides recommended ordering', async () => {
    render(<App />)
    await screen.findAllByRole('article')
    expect(screen.queryByRole('option', { name: 'Recomendados' })).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: /mínimo de jugadores/i }), { target: { value: '4' } })
    const callCount = vi.mocked(fetch).mock.calls.length
    fireEvent.change(screen.getByRole('spinbutton', { name: /máximo de jugadores/i }), { target: { value: '2' } })
    expect(screen.getByRole('alert')).toHaveTextContent('El mínimo de jugadores no puede superar el máximo.')
    expect(vi.mocked(fetch).mock.calls).toHaveLength(callCount)
    fireEvent.change(screen.getByRole('spinbutton', { name: /máximo de jugadores/i }), { target: { value: '4' } })
    expect(screen.queryByText('El mínimo de jugadores no puede superar el máximo.')).not.toBeInTheDocument()
    fireEvent.change(screen.getByRole('spinbutton', { name: /precio mínimo/i }), { target: { value: '100' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /precio máximo/i }), { target: { value: '10' } })
    expect(screen.getByRole('alert')).toHaveTextContent('El precio mínimo no puede superar el máximo.')
  })

  it('shows and recovers from an empty result', async () => {
    render(<App />)
    await screen.findAllByRole('article')
    const searchInput = screen.getByRole('searchbox', { name: /nombre o editorial/i })
    fireEvent.change(searchInput, { target: { value: 'inexistente' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(await screen.findByRole('status')).toHaveTextContent(/no encontramos juegos/i)
    fireEvent.click(screen.getAllByRole('button', { name: /limpiar filtros/i })[1])
    expect(await screen.findAllByRole('article')).toHaveLength(4)
  })

  it('sorts the BFF result by price locally', async () => {
    render(<App />)
    const cards = await screen.findAllByRole('article')
    fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar productos' }), { target: { value: 'price-low' } })
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Watergate',
      'Pequeñas Grandes Tácticas',
      "Aeon's End: Legacy",
      'Black Angel',
    ])
    expect(within(cards[0]).getByRole('img')).toHaveAccessibleName()
  })

  it('shows loading while the BFF request is pending', () => {
    vi.mocked(fetch).mockImplementationOnce(() => new Promise<Response>(() => undefined))

    render(<App />)

    expect(screen.getByText('Cargando catálogo...')).toBeInTheDocument()
  })

  it('shows an explicit error when the BFF request fails', async () => {
    vi.mocked(fetch).mockRejectedValueOnce(new Error('BFF unavailable'))

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent('BFF unavailable')
  })

  it('renders the products returned by the active filtered request', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({
      items: [products[2]],
      page: 1,
      page_size: 100,
      total: 1,
      total_pages: 1,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }))

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Pequeñas Grandes Tácticas' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Watergate' })).not.toBeInTheDocument()
  })
})
