import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import AdminRouter from './AdminRouter'
import type { components } from '../types/generated/bff-api'

const mocks = vi.hoisted(() => ({ apiFetch: vi.fn() }))
vi.mock('../lib/apiClient', () => ({ default: mocks.apiFetch }))

type Capabilities = components['schemas']['CurrentUserCapabilities']

beforeEach(() => {
  mocks.apiFetch.mockReset()
  mocks.apiFetch.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => [],
  })
})

describe('AdminRouter', () => {
  it('keeps product creation reachable under the shared shell', () => {
    render(<AdminRouter path="/admin/products/new" capabilities={{ is_staff: true, is_superuser: false } satisfies Capabilities} onNavigate={vi.fn()} />)

    expect(screen.getByRole('navigation', { name: 'Navegación de administración' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /producto/i })).toBeInTheDocument()
  })

  it('parses canonical product edit paths when rendered directly', async () => {
    render(<AdminRouter path="/admin/productos/42" capabilities={{ is_staff: true, is_superuser: false } satisfies Capabilities} onNavigate={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Editar producto 42' })).toBeInTheDocument()
    expect(await screen.findByRole('alert')).toBeInTheDocument()
  })

  it('keeps coupon management reachable under the shared shell', async () => {
    render(<AdminRouter path="/admin/coupons" capabilities={{ is_staff: false, is_superuser: true } satisfies Capabilities} onNavigate={vi.fn()} />)

    expect(screen.getByRole('navigation', { name: 'Navegación de administración' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Cupones' })).toBeInTheDocument()
    expect(await screen.findByText('Todavía no hay cupones.')).toBeInTheDocument()
  })

  it('does not expose Users navigation to staff-only capabilities', async () => {
    render(<AdminRouter path="/admin/products" capabilities={{ is_staff: true, is_superuser: false } satisfies Capabilities} onNavigate={vi.fn()} />)

    expect(screen.queryByRole('link', { name: 'Usuarios' })).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent(/respuesta de productos no es válida/i)
  })

  it('applies the superuser-only gate to legacy user routes as well as canonical routes', () => {
    render(<AdminRouter path="/admin/users/permissions" capabilities={{ is_staff: true, is_superuser: false } satisfies Capabilities} onNavigate={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'Acceso restringido' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Administración de usuarios' })).not.toBeInTheDocument()
  })

  it('does not treat unrelated English admin paths as a valid section', () => {
    render(<AdminRouter path="/admin/productss" capabilities={{ is_staff: true, is_superuser: true } satisfies Capabilities} onNavigate={vi.fn()} />)

    expect(screen.getByRole('heading', { name: 'No encontramos esta sección' })).toBeInTheDocument()
  })
})
