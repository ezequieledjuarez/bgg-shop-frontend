import { useEffect, useRef, useState, type FormEvent } from 'react'
import apiFetch from '../../lib/apiClient'
import type { components, operations } from '../../types/generated/bff-api'
import './UserManagementPanel.css'

type AdminUser = components['schemas']['AdminUser']
type AdminUserPage = components['schemas']['AdminUserPage']
type UpdatePrivilegeRequest = components['schemas']['AdminUpdateUserPrivilegeRequest']
type AdminUsersQuery = NonNullable<operations['adminListUsers']['parameters']['query']>
type Privileges = Pick<AdminUser, 'is_staff' | 'is_superuser'>
type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'success'; users: AdminUser[]; nextCursor: string | null }

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAdminUser(value: unknown): value is AdminUser {
  return isRecord(value)
    && typeof value.id === 'string'
    && typeof value.email === 'string'
    && typeof value.first_name === 'string'
    && typeof value.last_name === 'string'
    && typeof value.is_active === 'boolean'
    && typeof value.is_staff === 'boolean'
    && typeof value.is_superuser === 'boolean'
}

function isAdminUserPage(value: unknown): value is AdminUserPage {
  return isRecord(value)
    && Array.isArray(value.items)
    && value.items.every(isAdminUser)
    && (typeof value.next_cursor === 'string' || value.next_cursor === null)
}

function privilegesOf(user: AdminUser): Privileges {
  return { is_staff: user.is_staff, is_superuser: user.is_superuser }
}

function buildUserListUrl(query: AdminUsersQuery): string {
  const params = new URLSearchParams()
  if (query.search) params.set('search', query.search)
  if (query.cursor) params.set('cursor', query.cursor)
  if (query.limit !== undefined) params.set('limit', String(query.limit))
  const queryString = params.toString()
  return `${apiBaseUrl}/admin/users${queryString ? `?${queryString}` : ''}`
}

class UserManagementRequestError extends Error {
  constructor(readonly status: number) {
    super('User management request failed')
  }
}

async function fetchUserPage(search: string, cursor: string | undefined, signal: AbortSignal): Promise<AdminUserPage> {
  const query: AdminUsersQuery = { search, ...(cursor ? { cursor } : {}) }
  const response = await apiFetch(buildUserListUrl(query), { signal })
  if (!response.ok) throw new UserManagementRequestError(response.status)

  const payload: unknown = await response.json()
  if (!isAdminUserPage(payload)) throw new Error('Invalid user list response')
  return payload
}

function listErrorMessage(error: unknown): string {
  if (error instanceof UserManagementRequestError && error.status === 401) {
    return 'Tu sesión expiró o no está autenticada. Iniciá sesión para continuar.'
  }
  if (error instanceof UserManagementRequestError && error.status === 403) {
    return 'No tenés autorización para consultar ni administrar usuarios.'
  }
  return 'No se pudieron cargar los usuarios. No se muestran datos de personal.'
}

function privilegeErrorMessage(status: number): string {
  if (status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.'
  if (status === 403) return 'No tenés autorización para cambiar privilegios.'
  if (status === 404) return 'El usuario ya no existe; no se pudo guardar el cambio.'
  if (status === 409) return 'No se puede quitar el último superadministrador activo.'
  return 'No se pudo confirmar el cambio de privilegios.'
}

function authErrorMessage(status: number): string {
  return status === 401
    ? 'Tu sesión expiró. Iniciá sesión nuevamente.'
    : 'Tu sesión ya no tiene autorización para administrar usuarios.'
}

function UserManagementPanel() {
  const [loadState, setLoadState] = useState<LoadState>({ status: 'loading' })
  const [search, setSearch] = useState('')
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null)
  const [draftPrivileges, setDraftPrivileges] = useState<Privileges | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [saveMessage, setSaveMessage] = useState<string | null>(null)
  const [saveError, setSaveError] = useState<string | null>(null)
  const activeRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    activeRequest.current = controller
    void fetchUserPage('', undefined, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return
        setLoadState({ status: 'success', users: page.items, nextCursor: page.next_cursor })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setLoadState({ status: 'error', message: listErrorMessage(error) })
      })

    return () => {
      controller.abort()
      if (activeRequest.current === controller) activeRequest.current = null
    }
  }, [])

  const selectedUser = loadState.status === 'success'
    ? loadState.users.find((user) => user.id === selectedUserId) ?? null
    : null
  const hasChanges = selectedUser !== null
    && draftPrivileges !== null
    && (draftPrivileges.is_staff !== selectedUser.is_staff
      || draftPrivileges.is_superuser !== selectedUser.is_superuser)

  function loadUsers(nextSearch: string, cursor?: string, append = false) {
    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    const existingUsers = append && loadState.status === 'success' ? loadState.users : []
    setLoadState({ status: 'loading' })
    setSaveMessage(null)
    setSaveError(null)
    if (!append) {
      setSelectedUserId(null)
      setDraftPrivileges(null)
    }

    void fetchUserPage(nextSearch, cursor, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return
        setLoadState({
          status: 'success',
          users: append ? [...existingUsers, ...page.items] : page.items,
          nextCursor: page.next_cursor,
        })
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return
        setSelectedUserId(null)
        setDraftPrivileges(null)
        setLoadState({ status: 'error', message: listErrorMessage(error) })
      })
  }

  function handleSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    loadUsers(search.trim())
  }

  async function handleSave() {
    if (!selectedUser || !draftPrivileges || !hasChanges || isSaving) return

    activeRequest.current?.abort()
    const controller = new AbortController()
    activeRequest.current = controller
    const originalDraft = draftPrivileges
    let savedUser = selectedUser
    const changes: UpdatePrivilegeRequest[] = []
    if (originalDraft.is_staff !== savedUser.is_staff) {
      changes.push({ privilege: 'is_staff', enabled: originalDraft.is_staff })
    }
    if (originalDraft.is_superuser !== savedUser.is_superuser) {
      changes.push({ privilege: 'is_superuser', enabled: originalDraft.is_superuser })
    }

    setIsSaving(true)
    setSaveMessage(null)
    setSaveError(null)

    try {
      for (const body of changes) {
        const response = await apiFetch(
          `${apiBaseUrl}/admin/users/${encodeURIComponent(savedUser.id)}/privileges`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: controller.signal,
          },
        )

        if (response.status === 401 || response.status === 403) {
          if (controller.signal.aborted) return
          setSelectedUserId(null)
          setDraftPrivileges(null)
          setLoadState({ status: 'error', message: authErrorMessage(response.status) })
          setSaveError(null)
          return
        }
        if (!response.ok) {
          setDraftPrivileges(privilegesOf(savedUser))
          setSaveError(privilegeErrorMessage(response.status))
          return
        }

        const payload: unknown = await response.json()
        if (!isAdminUser(payload) || payload.id !== savedUser.id) {
          setDraftPrivileges(privilegesOf(savedUser))
          setSaveError('La respuesta del servidor no confirmó el usuario actualizado.')
          return
        }

        savedUser = payload
        setLoadState((current) => current.status === 'success'
          ? {
            ...current,
            users: current.users.map((user) => user.id === payload.id ? payload : user),
          }
          : current)
      }

      if (controller.signal.aborted) return
      setDraftPrivileges(privilegesOf(savedUser))
      setSaveMessage('Cambios guardados.')
    } catch {
      if (controller.signal.aborted) return
      setDraftPrivileges(privilegesOf(savedUser))
      setSaveError('No se pudo confirmar el cambio de privilegios.')
    } finally {
      if (!controller.signal.aborted) setIsSaving(false)
    }
  }

  function selectUser(user: AdminUser) {
    setSelectedUserId(user.id)
    setDraftPrivileges(privilegesOf(user))
    setSaveMessage(null)
    setSaveError(null)
  }

  const userList = loadState.status === 'success' ? loadState.users : []

  return (
    <main className="user-management-panel">
      <header className="user-management-header">
        <h1>Administración de usuarios</h1>
        <p>Seleccioná una cuenta existente para gestionar sus privilegios.</p>
      </header>

      {loadState.status === 'loading' && (
        <p className="user-management-notice" role="status">Cargando usuarios…</p>
      )}
      {loadState.status === 'error' && (
        <p className="user-management-notice user-management-error" role="alert">{loadState.message}</p>
      )}
      {loadState.status === 'success' && (
        <>
          <form className="user-management-search" onSubmit={handleSearch} role="search">
            <label htmlFor="user-management-search">Buscar usuarios</label>
            <div className="user-management-search-controls">
              <input
                autoComplete="off"
                id="user-management-search"
                onChange={(event) => setSearch(event.currentTarget.value)}
                type="text"
                value={search}
              />
              <button disabled={isSaving} type="submit">Buscar</button>
            </div>
          </form>

          <div className="user-management-table-scroll">
            <table aria-label="Usuarios">
              <thead>
                <tr>
                  <th scope="col">Nombre</th>
                  <th scope="col">Correo electrónico</th>
                  <th scope="col">Estado</th>
                  <th scope="col">Privilegios guardados</th>
                  <th scope="col">Acción</th>
                </tr>
              </thead>
              <tbody>
                {userList.map((user) => (
                  <tr key={user.id}>
                    <td>{`${user.first_name} ${user.last_name}`.trim() || '—'}</td>
                    <td>{user.email}</td>
                    <td>{user.is_active ? 'Activa' : 'Inactiva'}</td>
                    <td>
                      {[
                        user.is_staff ? 'Personal de administración' : null,
                        user.is_superuser ? 'Superadministrador' : null,
                      ].filter(Boolean).join(', ') || 'Sin privilegios'}
                    </td>
                    <td>
                      <button
                        aria-pressed={selectedUserId === user.id}
                        disabled={isSaving}
                        onClick={() => selectUser(user)}
                        type="button"
                      >
                        {selectedUserId === user.id ? 'Seleccionado' : 'Seleccionar'} {user.email}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {userList.length === 0 && (
            <p className="user-management-notice" role="status">No se encontraron usuarios.</p>
          )}
          {loadState.nextCursor && (
            <button
              className="user-management-load-more"
              disabled={isSaving}
              onClick={() => loadUsers(search.trim(), loadState.nextCursor ?? undefined, true)}
              type="button"
            >
              Cargar más usuarios
            </button>
          )}

          {selectedUser && draftPrivileges && (
            <section className="user-management-editor" aria-labelledby="user-management-editor-title">
              <h2 id="user-management-editor-title">Privilegios de {selectedUser.email}</h2>
              <fieldset disabled={isSaving}>
                <legend>Actualizá cada privilegio de forma independiente</legend>
                <label>
                  <input
                    checked={draftPrivileges.is_staff}
                    onChange={(event) => {
                      const enabled = event.currentTarget.checked
                      setDraftPrivileges((current) => current ? { ...current, is_staff: enabled } : current)
                    }}
                    type="checkbox"
                  />
                  Personal de administración
                </label>
                <label>
                  <input
                    checked={draftPrivileges.is_superuser}
                    onChange={(event) => {
                      const enabled = event.currentTarget.checked
                      setDraftPrivileges((current) => current ? { ...current, is_superuser: enabled } : current)
                    }}
                    type="checkbox"
                  />
                  Superadministrador
                </label>
              </fieldset>
              <button disabled={!hasChanges || isSaving} onClick={() => void handleSave()} type="button">
                {isSaving ? 'Guardando…' : 'Guardar cambios'}
              </button>
            </section>
          )}
          {saveMessage && <p className="user-management-notice" role="status">{saveMessage}</p>}
          {saveError && <p className="user-management-notice user-management-error" role="alert">{saveError}</p>}
        </>
      )}
    </main>
  )
}

export default UserManagementPanel
