import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('./lib/apiClient', () => ({ default: mocks.apiFetch }))

function response(payload: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload,
  } as Response
}

function setSession(session: Record<string, unknown> = { access_token: 'synthetic-bearer' }) {
  sessionStorage.setItem('bgg-shop.session', JSON.stringify(session))
}

function setLocation(path: string) {
  window.history.replaceState({}, '', path)
}

describe('role-aware administration navigation', () => {
  beforeEach(() => {
    mocks.apiFetch.mockReset()
    mocks.apiFetch.mockResolvedValue(response({ is_staff: true, is_superuser: false }))
    sessionStorage.clear()
    setLocation('/admin')
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ items: [], total: 0 })))
  })

  it.each([
    { capabilities: { is_staff: true, is_superuser: false }, usersVisible: false },
    { capabilities: { is_staff: false, is_superuser: true }, usersVisible: true },
    { capabilities: { is_staff: true, is_superuser: true }, usersVisible: true },
  ])('shows only the destinations allowed by operational capabilities %j', async ({ capabilities, usersVisible }) => {
    mocks.apiFetch.mockResolvedValue(response(capabilities))
    setSession()

    render(<App />)

    expect(await screen.findByRole('navigation', { name: 'Navegación de administración' })).toBeInTheDocument()
    expect(mocks.apiFetch.mock.calls[0][0]).toMatch(/\/api\/v1\/auth\/me$/)
    expect(mocks.apiFetch.mock.calls[0][1].cache).toBe('no-store')
    const navigation = screen.getByRole('navigation', { name: 'Navegación de administración' })
    expect(within(navigation).getByRole('link', { name: 'Productos' })).toHaveAttribute('href', '/admin/productos')
    if (usersVisible) {
      expect(within(navigation).getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/admin/usuarios')
    } else {
      expect(within(navigation).queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
    }
  })

  it('keeps the admin entry hidden for a signed-in buyer and denies direct admin routes', async () => {
    mocks.apiFetch.mockResolvedValue(response({ is_staff: false, is_superuser: false }))
    setSession()

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Acceso restringido' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Navegación de administración' })).not.toBeInTheDocument()
  })

  it('does not show an administration entry to a signed-in buyer on the storefront', async () => {
    setLocation('/')
    mocks.apiFetch.mockResolvedValue(response({ is_staff: false, is_superuser: false }))
    setSession()

    render(<App />)

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('link', { name: 'Administración' })).not.toBeInTheDocument()
  })

  it('does not request the personnel list for staff-only users on direct Users loads', async () => {
    setLocation('/admin/usuarios')
    setSession()

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'Acceso restringido' })).toBeInTheDocument()
    expect(mocks.apiFetch.mock.calls.some(([url]) => String(url).includes('/admin/users'))).toBe(false)
  })

  it('shows no protected navigation while capability resolution is pending', async () => {
    let resolveRequest!: (value: Response) => void
    mocks.apiFetch.mockReturnValue(new Promise<Response>((resolve) => { resolveRequest = resolve }))
    setSession()

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent(/verificando/i)
    expect(screen.queryByRole('navigation', { name: 'Navegación de administración' })).not.toBeInTheDocument()
    resolveRequest(response({ is_staff: true, is_superuser: false }))
    expect(await screen.findByRole('navigation', { name: 'Navegación de administración' })).toBeInTheDocument()
  })

  it('fails closed on malformed or failed capability data and supports retry', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(response({ is_staff: true, is_superuser: false, user: 'extra' }))
      .mockResolvedValueOnce(response({ is_staff: true, is_superuser: false }))
    setSession()

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos verificar/i)
    expect(screen.queryByRole('navigation', { name: 'Navegación de administración' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('navigation', { name: 'Navegación de administración' })).toBeInTheDocument()
  })

  it('shows a retryable error for upstream and network failures', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(response({ errors: [] }, 502))
      .mockResolvedValueOnce(response({ is_staff: true, is_superuser: false }))
    setSession()

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos verificar/i)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('navigation', { name: 'Navegación de administración' })).toBeInTheDocument()
  })

  it('treats a 401 current-user response as failed closed and offers retry', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(response({ errors: [] }, 401))
      .mockResolvedValueOnce(response({ is_staff: true, is_superuser: false }))
    setSession()

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos verificar/i)
    expect(screen.queryByRole('navigation', { name: 'Navegación de administración' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('navigation', { name: 'Navegación de administración' })).toBeInTheDocument()
  })

  it('recovers after a network request rejects', async () => {
    mocks.apiFetch
      .mockRejectedValueOnce(new Error('synthetic offline'))
      .mockResolvedValueOnce(response({ is_staff: true, is_superuser: false }))
    setSession()

    render(<App />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos verificar/i)
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('navigation', { name: 'Navegación de administración' })).toBeInTheDocument()
  })

  it('does not treat operation-key-only sessions as authenticated admin sessions', async () => {
    setSession({ op_key: 'synthetic-operation-key' })

    render(<App />)

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Te damos la bienvenida' })).toBeInTheDocument())
    expect(mocks.apiFetch).not.toHaveBeenCalled()
  })

  it('does not request capabilities or render administration when signed out', async () => {
    render(<App />)

    await waitFor(() => expect(window.location.pathname).toBe('/iniciar-sesion'))
    expect(mocks.apiFetch).not.toHaveBeenCalled()
    expect(screen.queryByRole('navigation', { name: 'Navegación de administración' })).not.toBeInTheDocument()
  })

  it('revalidates role flags after a session change and removes the previous snapshot', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(response({ is_staff: true, is_superuser: true }))
      .mockResolvedValueOnce(response({ is_staff: true, is_superuser: false }))
    setSession()

    render(<App />)

    const navigation = await screen.findByRole('navigation', { name: 'Navegación de administración' })
    expect(within(navigation).getByRole('link', { name: 'Usuarios' })).toBeInTheDocument()
    act(() => window.dispatchEvent(new Event('bgg-shop:session-change')))

    await waitFor(() => expect(within(navigation).queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument())
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2)
  })

  it('clears role-backed navigation when an admin request is denied', async () => {
    mocks.apiFetch
      .mockResolvedValueOnce(response({ is_staff: true, is_superuser: false }))
      .mockResolvedValueOnce(response({ errors: [] }, 403))
    setSession()

    render(<App />)

    expect(await screen.findByRole('navigation', { name: 'Navegación de administración' })).toBeInTheDocument()
    act(() => window.dispatchEvent(new Event('bgg-shop:admin-authorization-denied')))
    expect(await screen.findByRole('alert')).toHaveTextContent(/no pudimos verificar/i)
    expect(screen.queryByRole('navigation', { name: 'Navegación de administración' })).not.toBeInTheDocument()
  })

  it('shows the navigation entry on the storefront only after role resolution', async () => {
    setLocation('/')
    setSession()
    mocks.apiFetch.mockResolvedValue(response({ is_staff: true, is_superuser: false }))

    render(<App />)

    expect(await screen.findByRole('link', { name: 'Administración' })).toHaveAttribute('href', '/admin')
  })

  it('ignores a late response from the previous bearer session', async () => {
    let resolveOldRequest!: (value: Response) => void
    mocks.apiFetch
      .mockReturnValueOnce(new Promise<Response>((resolve) => { resolveOldRequest = resolve }))
      .mockResolvedValueOnce(response({ is_staff: false, is_superuser: false }))
    setSession({ access_token: 'synthetic-old-bearer' })

    render(<App />)

    await waitFor(() => expect(mocks.apiFetch).toHaveBeenCalledTimes(1))
    setSession({ access_token: 'synthetic-new-bearer' })
    act(() => window.dispatchEvent(new Event('bgg-shop:session-change')))

    expect(await screen.findByRole('heading', { name: 'Acceso restringido' })).toBeInTheDocument()
    resolveOldRequest(response({ is_staff: true, is_superuser: true }))
    await waitFor(() => expect(screen.queryByRole('navigation', { name: 'Navegación de administración' })).not.toBeInTheDocument())
    expect(mocks.apiFetch).toHaveBeenCalledTimes(2)
  })

  it('clears capability-backed content on logout', async () => {
    setSession()
    render(<App />)

    expect(await screen.findByRole('navigation', { name: 'Navegación de administración' })).toBeInTheDocument()
    sessionStorage.removeItem('bgg-shop.session')
    act(() => window.dispatchEvent(new Event('bgg-shop:session-change')))

    expect(await screen.findByRole('heading', { name: 'Te damos la bienvenida' })).toBeInTheDocument()
    expect(screen.queryByRole('navigation', { name: 'Navegación de administración' })).not.toBeInTheDocument()
  })

  it('keeps unknown admin URLs inside the guarded shell without mounting another panel', async () => {
    setLocation('/admin/not-a-module')
    setSession()

    render(<App />)

    expect(await screen.findByRole('heading', { name: 'No encontramos esta sección' })).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Navegación de administración' })).toBeInTheDocument()
  })
})
