import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { components } from '../../types/generated/bff-api'
import AdminRouter from '../AdminRouter'

type AdminUser = components['schemas']['AdminUser']
type AdminUserPage = components['schemas']['AdminUserPage']
type UpdatePrivilegeRequest = components['schemas']['AdminUpdateUserPrivilegeRequest']

const initialUsers: AdminUser[] = [
  {
    id: 'user-ada',
    email: 'ada@example.test',
    first_name: 'Ada',
    last_name: 'Lovelace',
    is_active: true,
    is_staff: true,
    is_superuser: false,
  },
  {
    id: 'user-grace',
    email: 'grace@example.test',
    first_name: 'Grace',
    last_name: 'Hopper',
    is_active: true,
    is_staff: false,
    is_superuser: false,
  },
]

let users: AdminUser[] = []
let listRequests: URL[] = []
let privilegeRequests: Array<{ userId: string; body: UpdatePrivilegeRequest }> = []
let privilegeStatus = 200
let listStatus = 200

const server = setupServer(
  http.get('*/api/v1/admin/users', ({ request }) => {
    const url = new URL(request.url)
    listRequests.push(url)
    if (listStatus !== 200) {
      return HttpResponse.json({ detail: 'synthetic private upstream detail' }, { status: listStatus })
    }

    const search = (url.searchParams.get('search') ?? '').toLocaleLowerCase()
    const items = users.filter((user) =>
      `${user.email} ${user.first_name} ${user.last_name}`.toLocaleLowerCase().includes(search),
    )
    const response: AdminUserPage = { items, next_cursor: null }
    return HttpResponse.json(response)
  }),
  http.patch('*/api/v1/admin/users/:userId/privileges', async ({ params, request }) => {
    const body = await request.json() as UpdatePrivilegeRequest
    privilegeRequests.push({ userId: String(params.userId), body })
    if (privilegeStatus !== 200) {
      return HttpResponse.json({
        errors: [{ code: 'LAST_ACTIVE_SUPERUSER', message: 'No se puede quitar el último Superadministrador activo.' }],
      }, { status: privilegeStatus })
    }

    const user = users.find(({ id }) => id === params.userId)
    if (!user) return HttpResponse.json({ detail: 'not found' }, { status: 404 })
    const updatedUser = { ...user, [body.privilege]: body.enabled }
    users = users.map((item) => item.id === updatedUser.id ? updatedUser : item)
    return HttpResponse.json(updatedUser)
  }),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  users = initialUsers.map((user) => ({ ...user }))
  listRequests = []
  privilegeRequests = []
  privilegeStatus = 200
  listStatus = 200
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'synthetic-admin-token' }))
  window.history.replaceState({}, '', '/admin/users')
})
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
})
afterAll(() => server.close())

describe('UserManagementPanel', () => {
  it('searches and selects existing users, and saves each privilege independently', async () => {
    render(<AdminRouter path="/admin/users" capabilities={{ is_staff: true, is_superuser: true }} onNavigate={() => undefined} />)

    expect(await screen.findByRole('heading', { name: /administración de usuarios/i })).toBeInTheDocument()
    expect(await screen.findByRole('table', { name: /usuarios/i })).toBeInTheDocument()
    expect(screen.getByText('ada@example.test')).toBeInTheDocument()
    expect(screen.getByText('grace@example.test')).toBeInTheDocument()

    fireEvent.change(screen.getByRole('textbox', { name: /buscar usuarios/i }), {
      target: { value: 'grace' },
    })
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))
    await waitFor(() => expect(listRequests).toHaveLength(2))
    expect(listRequests[1].searchParams.get('search')).toBe('grace')
    expect(await screen.findByText('grace@example.test')).toBeInTheDocument()
    expect(screen.queryByText('ada@example.test')).not.toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /seleccionar.*grace@example\.test/i }))
    const staffControl = screen.getByRole('checkbox', { name: /personal de administración/i })
    const superuserControl = screen.getByRole('checkbox', { name: /superadministrador/i })
    expect(staffControl).not.toBeChecked()
    expect(superuserControl).not.toBeChecked()

    fireEvent.click(superuserControl)
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/guardad/i)
    await waitFor(() => expect(privilegeRequests).toHaveLength(1))
    expect(privilegeRequests[0]).toEqual({
      userId: 'user-grace',
      body: { privilege: 'is_superuser', enabled: true },
    })
    expect(staffControl).not.toBeChecked()

    const adaSearch = screen.getByRole('textbox', { name: /buscar usuarios/i })
    fireEvent.change(adaSearch, { target: { value: 'ada' } })
    fireEvent.click(screen.getByRole('button', { name: /buscar/i }))
    await waitFor(() => expect(listRequests).toHaveLength(3))
    fireEvent.click(await screen.findByRole('button', { name: /seleccionar.*ada@example\.test/i }))

    const adaStaffControl = screen.getByRole('checkbox', { name: /personal de administración/i })
    expect(adaStaffControl).toBeChecked()
    fireEvent.click(adaStaffControl)
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))
    expect(await screen.findByRole('status')).toHaveTextContent(/guardad/i)
    await waitFor(() => expect(privilegeRequests).toHaveLength(2))
    expect(privilegeRequests[1]).toEqual({
      userId: 'user-ada',
      body: { privilege: 'is_staff', enabled: false },
    })
  })

  it('does not expose personnel after the listing endpoint refuses access', async () => {
    // This verifies the UI response to a BFF denial, not a frontend authorization boundary.
    listStatus = 403
    render(<AdminRouter path="/admin/users" capabilities={{ is_staff: true, is_superuser: true }} onNavigate={() => undefined} />)

    expect(await screen.findByRole('alert')).toBeInTheDocument()
    expect(screen.queryByText(/synthetic private upstream detail/i)).not.toBeInTheDocument()
    expect(screen.queryByText('ada@example.test')).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /personal de administración/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: /superadministrador/i })).not.toBeInTheDocument()
  })

  it('keeps operational admin destinations in navigation and offers no employee onboarding flow', async () => {
    // This fixture supplies the server capability response for an authorized direct render.
    const { unmount } = render(<AdminRouter path="/admin" capabilities={{ is_staff: true, is_superuser: true }} onNavigate={() => undefined} />)

    const navigation = screen.getByRole('navigation', { name: 'Navegación de administración' })
    expect(navigation).toHaveTextContent('Productos')
    expect(navigation).toHaveTextContent('Promociones')
    expect(navigation).toHaveTextContent('Cupones')
    expect(navigation).toHaveTextContent('Gift cards')
    expect(navigation).toHaveTextContent('Historial de auditoría')
    expect(navigation).toHaveTextContent('Ventas')
    expect(navigation).toHaveTextContent('Reseñas')
    expect(within(navigation).getByRole('link', { name: 'Usuarios' })).toHaveAttribute('href', '/admin/users')
    unmount()

    render(<AdminRouter path="/admin/users" capabilities={{ is_staff: true, is_superuser: true }} onNavigate={() => undefined} />)
    expect(await screen.findByRole('heading', { name: /administración de usuarios/i })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /crear usuario|invitar empleado|alta de empleado/i })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /crear usuario|invitar empleado|alta de empleado/i })).not.toBeInTheDocument()
  })

  it('shows a safe failure and preserves the saved superuser value after a rejected revocation', async () => {
    privilegeStatus = 409
    users = [{
      ...initialUsers[0],
      is_superuser: true,
    }]
    render(<AdminRouter path="/admin/users" capabilities={{ is_staff: true, is_superuser: true }} onNavigate={() => undefined} />)

    expect(await screen.findByRole('heading', { name: /administración de usuarios/i })).toBeInTheDocument()
    fireEvent.click(await screen.findByRole('button', { name: /seleccionar.*ada@example\.test/i }))
    const superuserControl = screen.getByRole('checkbox', { name: /superadministrador/i })
    expect(superuserControl).toBeChecked()
    fireEvent.click(superuserControl)
    fireEvent.click(screen.getByRole('button', { name: /guardar cambios/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/último superadministrador/i)
    expect(superuserControl).toBeChecked()
    expect(screen.queryByText(/synthetic private upstream detail/i)).not.toBeInTheDocument()
    await waitFor(() => expect(privilegeRequests).toEqual([{
      userId: 'user-ada',
      body: { privilege: 'is_superuser', enabled: false },
    }]))
  })
})
