import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { components } from '../../types/generated/bff-api'
import AdminRouter from '../AdminRouter'
import AuditPanel from './AuditPanel'

type AuditRecord = components['schemas']['AdminAuditRecord']
type AuditPage = components['schemas']['AdminAuditPage']

const firstRecord: AuditRecord = {
  id: 27,
  actor_id: 'staff-4',
  action: 'coupon_updated',
  entity_type: 'coupon',
  entity_id: '73',
  created_at: '2026-11-02T13:45:00Z',
  changes: {
    before: { password: '[REDACTED]', remaining: 5 },
    after: { access_token: '[REDACTED]', remaining: 4 },
  },
}

const secondRecord: AuditRecord = {
  ...firstRecord,
  id: 26,
  action: 'coupon_created',
}

const firstPage: AuditPage = { items: [firstRecord], next_cursor: 'opaque+/cursor==' }
const finalPage: AuditPage = { items: [secondRecord], next_cursor: null }
const requests: URL[] = []
let responsePage: AuditPage = firstPage

const server = setupServer(
  http.get('*/api/v1/admin/audit', ({ request }) => {
    requests.push(new URL(request.url))
    return HttpResponse.json(responsePage)
  }),
)

beforeAll(() => server.listen())
beforeEach(() => {
  requests.length = 0
  responsePage = firstPage
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'admin-token' }))
  window.history.replaceState({}, '', '/admin/audit')
})
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
})
afterAll(() => server.close())

describe('AuditPanel', () => {
  it('loads the audit route and requests the contract default page size', async () => {
    const { unmount } = render(<AdminRouter path="/admin/audit" capabilities={{ is_staff: true, is_superuser: true }} onNavigate={() => undefined} />)

    expect(await screen.findByRole('heading', { name: 'Historial de auditoría' })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: 'Registros de auditoría' })).toBeInTheDocument()
    expect(requests).toHaveLength(1)
    expect(requests[0].pathname).toBe('/api/v1/admin/audit')
    expect(requests[0].searchParams.get('limit')).toBe('50')
    expect(requests[0].searchParams.has('cursor')).toBe(false)
    unmount()

    render(<AdminRouter path="/admin" capabilities={{ is_staff: true, is_superuser: true }} onNavigate={() => undefined} />)
    expect(screen.getByRole('navigation', { name: 'Navegación de administración' })).toBeInTheDocument()
    expect(within(screen.getByRole('navigation', { name: 'Navegación de administración' }))
      .getByRole('link', { name: 'Historial de auditoría' })).toHaveAttribute('href', '/admin/audit')

    requests.length = 0
    render(<AuditPanel />)
    await screen.findByRole('table', { name: 'Registros de auditoría' })
    fireEvent.change(screen.getByRole('combobox', { name: 'Registros por página' }), { target: { value: '100' } })
    await waitFor(() => expect(requests).toHaveLength(2))
    expect(requests[1].searchParams.get('limit')).toBe('100')
  })

  it('applies exact-match filters and UTC date-time params only after valid submission', async () => {
    render(<AuditPanel />)
    await screen.findByRole('table', { name: 'Registros de auditoría' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Tipo de entidad' }), { target: { value: ' coupon ' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'ID de entidad' }), { target: { value: '73' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'ID del actor' }), { target: { value: 'staff-4' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Acción' }), { target: { value: 'coupon_updated' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Desde (UTC)' }), { target: { value: '2026-11-01T00:00:00Z' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Hasta (UTC)' }), { target: { value: '2026-11-03T00:00:00Z' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    await waitFor(() => expect(requests).toHaveLength(2))
    const query = requests[1].searchParams
    expect(query.get('entity_type')).toBe('coupon')
    expect(query.get('entity_id')).toBe('73')
    expect(query.get('actor_id')).toBe('staff-4')
    expect(query.get('action')).toBe('coupon_updated')
    expect(query.get('created_from')).toBe('2026-11-01T00:00:00Z')
    expect(query.get('created_to')).toBe('2026-11-03T00:00:00Z')
    expect(query.get('limit')).toBe('50')
    expect(query.has('cursor')).toBe(false)
  })

  it('rejects malformed or reversed date ranges without making a filtered request', async () => {
    render(<AuditPanel />)
    await screen.findByRole('table', { name: 'Registros de auditoría' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Desde (UTC)' }), { target: { value: '2026-11-03T00:00:00' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Hasta (UTC)' }), { target: { value: '2026-11-01T00:00:00Z' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(await screen.findByText(/fecha ISO 8601 válida con zona horaria/i)).toBeInTheDocument()
    expect(requests).toHaveLength(1)

    fireEvent.change(screen.getByRole('textbox', { name: 'Desde (UTC)' }), { target: { value: '2026-11-03T00:00:00Z' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(await screen.findByText('La fecha Desde no puede ser posterior a Hasta.')).toBeInTheDocument()
    expect(requests).toHaveLength(1)

    fireEvent.change(screen.getByRole('textbox', { name: 'Desde (UTC)' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'Hasta (UTC)' }), { target: { value: '' } })
    fireEvent.change(screen.getByRole('textbox', { name: 'ID del actor' }), { target: { value: 'a'.repeat(151) } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))
    expect(await screen.findByText('Usá como máximo 150 caracteres.')).toBeInTheDocument()
    expect(requests).toHaveLength(1)
  })

  it('displays the redacted API-provided before and after values as text', async () => {
    render(<AuditPanel />)
    await screen.findByRole('table', { name: 'Registros de auditoría' })
    fireEvent.click(screen.getByText('Ver cambios'))

    const row = screen.getByRole('row', { name: /coupon_updated/ })
    expect(row.textContent?.match(/\[REDACTED\]/g)).toHaveLength(2)
    expect(row).toHaveTextContent('"remaining": 5')
    expect(row).toHaveTextContent('"remaining": 4')
    expect(row).not.toHaveTextContent('admin-token')
  })

  it('uses the opaque next cursor unchanged and does not invent reverse pagination', async () => {
    render(<AuditPanel />)
    await screen.findByRole('table', { name: 'Registros de auditoría' })

    server.use(http.get('*/api/v1/admin/audit', ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json(requests[requests.length - 1].searchParams.has('cursor') ? finalPage : firstPage)
    }))
    fireEvent.click(screen.getByRole('button', { name: 'Siguiente página' }))
    expect(await screen.findByRole('row', { name: /coupon_created/ })).toBeInTheDocument()
    expect(requests[1].searchParams.get('cursor')).toBe('opaque+/cursor==')
    expect(screen.queryByRole('button', { name: /anterior|previous/i })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Siguiente página' })).toBeDisabled()
  })

  it('resets cursor pagination when filters are reapplied', async () => {
    render(<AuditPanel />)
    await screen.findByRole('table', { name: 'Registros de auditoría' })
    server.use(http.get('*/api/v1/admin/audit', ({ request }) => {
      requests.push(new URL(request.url))
      return HttpResponse.json(requests[requests.length - 1].searchParams.has('cursor') ? finalPage : firstPage)
    }))

    fireEvent.click(screen.getByRole('button', { name: 'Siguiente página' }))
    await screen.findByRole('row', { name: /coupon_created/ })
    fireEvent.change(screen.getByRole('textbox', { name: 'ID del actor' }), { target: { value: 'staff-8' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar filtros' }))

    await waitFor(() => expect(requests).toHaveLength(3))
    expect(requests[2].searchParams.get('actor_id')).toBe('staff-8')
    expect(requests[2].searchParams.has('cursor')).toBe(false)
    expect(screen.getByText('Página 1')).toBeInTheDocument()
  })

  it('shows loading and empty states explicitly', async () => {
    let releaseResponse: (() => void) | undefined
    server.use(http.get('*/api/v1/admin/audit', () => new Promise((resolve) => {
      releaseResponse = () => resolve(HttpResponse.json({ items: [], next_cursor: null } satisfies AuditPage))
    })))
    render(<AuditPanel />)

    expect(screen.getByRole('status')).toHaveTextContent('Cargando historial')
    await waitFor(() => expect(releaseResponse).toBeDefined())
    releaseResponse?.()
    expect(await screen.findByText('No hay registros de auditoría para estos filtros.')).toBeInTheDocument()
  })

  it('shows sanitized messages for unauthenticated, forbidden, and upstream errors', async () => {
    server.use(http.get('*/api/v1/admin/audit', () => HttpResponse.json({ detail: 'upstream secret token' }, { status: 401 })))
    render(<AuditPanel />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Tu sesión no está autenticada o expiró.')
    expect(screen.queryByText('upstream secret token')).not.toBeInTheDocument()

    server.use(http.get('*/api/v1/admin/audit', () => HttpResponse.json({}, { status: 403 })))
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('No tenés permisos para consultar el historial')

    server.use(http.get('*/api/v1/admin/audit', () => HttpResponse.json({}, { status: 502 })))
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('no está disponible en este momento')

    server.use(http.get('*/api/v1/admin/audit', () => HttpResponse.json({ detail: 'private upstream detail' }, { status: 400 })))
    fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Los filtros enviados no son válidos.')
    expect(screen.queryByText('private upstream detail')).not.toBeInTheDocument()
  })

  it('shows a validation error for an invalid API response', async () => {
    server.use(http.get('*/api/v1/admin/audit', () => HttpResponse.json({ items: [{ id: 'not-an-id' }], next_cursor: null })))
    render(<AuditPanel />)

    expect(await screen.findByRole('alert')).toHaveTextContent('no tiene un formato válido')
  })
})
