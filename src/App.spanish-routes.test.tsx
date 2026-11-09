import { fireEvent, render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { SESSION_STORAGE_KEY } from './auth/session'

function visit(path: string, state: unknown = {}) {
  window.history.replaceState(state, '', path)
}

beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = new URL(input.toString(), window.location.origin)
    const payload = url.pathname.endsWith('/product-categories') || url.pathname.endsWith('/product-publishers')
      ? []
      : { items: [], page: 1, page_size: 100, total: 0, total_pages: 0 }
    return Promise.resolve(new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }))
  }))
})

describe('Spanish UI routes', () => {
  it('canonicalizes a legacy direct entry and preserves history state, query, and fragment', () => {
    const historyState = { source: 'legacy-link' }
    visit('/login?return=%2Fcheckout&literal=a+b#form', historyState)

    render(<App />)

    expect(screen.getByRole('heading', { name: 'Te damos la bienvenida' })).toBeVisible()
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe('/iniciar-sesion?return=%2Fcheckout&literal=a+b#form')
    expect(window.history.state).toEqual(historyState)
  })

  it('canonicalizes aliases reached through browser back/forward navigation', () => {
    visit('/iniciar-sesion')
    render(<App />)

    window.history.pushState({ source: 'history' }, '', '/register?from=login#account')
    fireEvent(window, new PopStateEvent('popstate'))

    expect(screen.getByRole('heading', { name: 'Creá tu cuenta' })).toBeVisible()
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe('/registro?from=login#account')
    expect(window.history.state).toEqual({ source: 'history' })
  })

  it('uses canonical authentication links in the storefront', () => {
    visit('/catalogo')
    render(<App />)

    expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/iniciar-sesion')
    expect(screen.getByRole('link', { name: 'Crear cuenta' })).toHaveAttribute('href', '/registro')
  })

  it('canonicalizes a stored legacy return destination after login without accepting external URLs', () => {
    const origin = window.location.origin
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: 'test-token' }))
    sessionStorage.setItem('bgg-shop.pending-return', '/checkout?source=legacy#resume')
    visit('/')
    render(<App />)

    fireEvent(window, new PopStateEvent('popstate'))
    expect(window.location.pathname + window.location.search + window.location.hash)
      .toBe('/finalizar-compra?source=legacy#resume')

    sessionStorage.setItem('bgg-shop.pending-return', 'https://foreign.example/account')
    visit('/')
    fireEvent(window, new PopStateEvent('popstate'))
    expect(window.location.origin).toBe(origin)
    expect(window.location.pathname).toBe('/')

    sessionStorage.setItem('bgg-shop.pending-return', '/api/v1/admin/products')
    visit('/')
    fireEvent(window, new PopStateEvent('popstate'))
    expect(window.location.pathname).toBe('/')
  })
})
