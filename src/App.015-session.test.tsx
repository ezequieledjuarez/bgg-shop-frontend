import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('./lib/apiClient', () => ({ default: mocks.apiFetch }))

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

function response(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function setLocation(path: string) {
  window.history.replaceState({}, '', path)
}

function setSession() {
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({
    access_token: 'synthetic-expired-access',
    refresh_token: 'synthetic-refresh-cookie-fallback',
    op_key: 'synthetic-operation-key',
  }))
}

beforeEach(() => {
  mocks.apiFetch.mockReset()
  mocks.apiFetch.mockResolvedValue(response({ is_staff: false, is_superuser: false }))
  setLocation('/catalogo')
  sessionStorage.clear()
  localStorage.clear()
  vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input)
    if (url.includes('/auth/refresh')) return response({})
    if (url.includes('/product-categories')) return response([])
    if (url.includes('/product-publishers')) return response([])
    return response({ items: [], page: 1, page_size: 8, total: 0, total_pages: 0 })
  }))
})

describe('feature 015 session resilience', () => {
  it('tries one refresh on 401 and preserves other session fields after success', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ is_staff: true, is_superuser: false }))
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes('/auth/refresh')) {
        return response({ access_token: 'synthetic-refreshed-access' })
      }
      if (String(input).includes('/product-categories')) return response([])
      if (String(input).includes('/product-publishers')) return response([])
      return response({ items: [], page: 1, page_size: 8, total: 0, total_pages: 0 })
    })
    setSession()

    render(<App />)

    expect(await screen.findByRole('link', { name: 'Administración' })).toBeVisible()
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2)
    expect(vi.mocked(fetch)).toHaveBeenCalledWith(`${apiBaseUrl.replace(/\/+$/, '')}/auth/refresh`, {
      method: 'POST',
      credentials: 'include',
    })
    expect(JSON.parse(sessionStorage.getItem('bgg-shop.session') ?? '{}')).toEqual({
      access_token: 'synthetic-refreshed-access',
      refresh_token: 'synthetic-refresh-cookie-fallback',
      op_key: 'synthetic-operation-key',
    })
  })

  it('clears only the account session after refresh rejection', async () => {
    mocks.apiFetch.mockResolvedValueOnce(response({}, 401))
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes('/auth/refresh')) return response({}, 401)
      return response({ items: [], page: 1, page_size: 8, total: 0, total_pages: 0 })
    })
    setSession()
    localStorage.setItem('anonymous-cart-fixture', 'keep')

    render(<App />)

    await waitFor(() => expect(sessionStorage.getItem('bgg-shop.session')).toBeNull())
    expect(await screen.findByRole('link', { name: 'Iniciar sesión' })).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument()
    expect(localStorage.getItem('anonymous-cart-fixture')).toBe('keep')
    expect(mocks.apiFetch).toHaveBeenCalledTimes(1)
  })

  it('preserves the account when refresh is temporarily unavailable', async () => {
    mocks.apiFetch.mockResolvedValueOnce(response({}, 401))
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes('/auth/refresh')) return response({}, 502)
      return response({ items: [], page: 1, page_size: 8, total: 0, total_pages: 0 })
    })
    setSession()

    render(<App />)

    expect(await screen.findByText(/no pudimos verificar tus permisos/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
    expect(sessionStorage.getItem('bgg-shop.session')).not.toBeNull()
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument()
  })

  it('treats a 403 as a denied permission check without refreshing or logging out', async () => {
    mocks.apiFetch.mockResolvedValueOnce(response({}, 403))
    setSession()

    render(<App />)

    expect(await screen.findByText(/no pudimos verificar tus permisos/i)).toBeVisible()
    expect(screen.getByRole('button', { name: 'Cerrar sesión' })).toBeVisible()
    expect(sessionStorage.getItem('bgg-shop.session')).not.toBeNull()
    expect(vi.mocked(fetch)).not.toHaveBeenCalledWith(`${apiBaseUrl.replace(/\/+$/, '')}/auth/refresh`, expect.anything())
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument()
  })

  it('retries refresh only after an explicit retry when it was unavailable', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({ is_staff: false, is_superuser: true }))
    let refreshCalls = 0
    vi.mocked(fetch).mockImplementation(async (input) => {
      if (String(input).includes('/auth/refresh')) {
        refreshCalls += 1
        return refreshCalls === 1
          ? response({}, 502)
          : response({ access_token: 'synthetic-retried-access' })
      }
      if (String(input).includes('/product-categories')) return response([])
      if (String(input).includes('/product-publishers')) return response([])
      return response({ items: [], page: 1, page_size: 8, total: 0, total_pages: 0 })
    })
    setSession()

    render(<App />)

    expect(await screen.findByText(/no pudimos verificar tus permisos/i)).toBeVisible()
    expect(refreshCalls).toBe(1)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))

    expect(await screen.findByRole('link', { name: 'Administración' })).toBeVisible()
    expect(refreshCalls).toBe(2)
    expect(JSON.parse(sessionStorage.getItem('bgg-shop.session') ?? '{}').access_token)
      .toBe('synthetic-retried-access')
  })

  it('does not retry after the newly refreshed token is also rejected', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(response({}, 401))
      .mockResolvedValueOnce(response({}, 401))
    vi.mocked(fetch).mockImplementation(async (input) => String(input).includes('/auth/refresh')
      ? response({ access_token: 'synthetic-rejected-access' })
      : response({ items: [], page: 1, page_size: 8, total: 0, total_pages: 0 }))
    setSession()

    render(<App />)

    await waitFor(() => expect(sessionStorage.getItem('bgg-shop.session')).toBeNull())
    expect(vi.mocked(fetch).mock.calls.filter(([input]) => String(input).includes('/auth/refresh'))).toHaveLength(1)
  })
})
