import { useEffect, useState, type FormEvent } from 'react'
import apiFetch from '../../lib/apiClient'
import type { components, operations } from '../../types/generated/bff-api'

type AuditRecord = components['schemas']['AdminAuditRecord']
type AuditPage = components['schemas']['AdminAuditPage']
type AuditQuery = NonNullable<operations['adminListAuditRecords']['parameters']['query']>
type FilterName = 'entity_type' | 'entity_id' | 'actor_id' | 'action' | 'created_from' | 'created_to'
type AuditFilters = Pick<AuditQuery, FilterName>
type FilterDraft = Record<FilterName, string>
type FilterErrors = Partial<Record<FilterName | 'date_range', string>>

const DEFAULT_PAGE_SIZE = 50
const MAX_PAGE_SIZE = 100
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

const EMPTY_DRAFT: FilterDraft = {
  entity_type: '',
  entity_id: '',
  actor_id: '',
  action: '',
  created_from: '',
  created_to: '',
}

const FIELD_CONFIG: { name: FilterName; label: string; maxLength?: number; placeholder?: string }[] = [
  { name: 'entity_type', label: 'Tipo de entidad', maxLength: 150 },
  { name: 'entity_id', label: 'ID de entidad', maxLength: 64 },
  { name: 'actor_id', label: 'ID del actor', maxLength: 150 },
  { name: 'action', label: 'Acción', maxLength: 100 },
  { name: 'created_from', label: 'Desde (UTC)', placeholder: '2026-11-02T00:00:00Z' },
  { name: 'created_to', label: 'Hasta (UTC)', placeholder: '2026-11-02T23:59:59Z' },
]

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAuditRecord(value: unknown): value is AuditRecord {
  if (!isObject(value)) return false
  const changes = value.changes
  if (!isObject(changes)) return false
  const isChangeSet = (item: unknown) => item === null || isObject(item)
  return typeof value.id === 'number'
    && Number.isSafeInteger(value.id)
    && value.id > 0
    && (typeof value.actor_id === 'string' || value.actor_id === null)
    && typeof value.action === 'string'
    && (typeof value.entity_type === 'string' || value.entity_type === null)
    && (typeof value.entity_id === 'string' || value.entity_id === null)
    && typeof value.created_at === 'string'
    && Number.isFinite(Date.parse(value.created_at))
    && isChangeSet(changes.before)
    && isChangeSet(changes.after)
}

function isAuditPage(value: unknown): value is AuditPage {
  return isObject(value)
    && Array.isArray(value.items)
    && value.items.every(isAuditRecord)
    && (value.next_cursor === null || (typeof value.next_cursor === 'string' && value.next_cursor.length > 0))
}

function validateFilters(draft: FilterDraft): { filters?: AuditFilters; errors: FilterErrors } {
  const errors: FilterErrors = {}
  const filters: AuditFilters = {}

  for (const { name, maxLength } of FIELD_CONFIG) {
    const value = draft[name].trim()
    if (!value) continue
    if (maxLength !== undefined && value.length > maxLength) {
      errors[name] = `Usá como máximo ${maxLength} caracteres.`
      continue
    }
    if (name === 'created_from' || name === 'created_to') {
      const isTimezoneDateTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/i.test(value)
      if (!isTimezoneDateTime || !Number.isFinite(Date.parse(value))) {
        errors[name] = 'Ingresá una fecha ISO 8601 válida con zona horaria, por ejemplo 2026-11-02T00:00:00Z.'
        continue
      }
    }
    filters[name] = value
  }

  if (!errors.created_from && !errors.created_to && filters.created_from && filters.created_to
    && Date.parse(filters.created_from) > Date.parse(filters.created_to)) {
    errors.date_range = 'La fecha Desde no puede ser posterior a Hasta.'
  }

  return { filters: Object.keys(errors).length === 0 ? filters : undefined, errors }
}

function errorMessage(status: number): string {
  if (status === 400) return 'Los filtros enviados no son válidos. Revisalos e intentá nuevamente.'
  if (status === 401) return 'Tu sesión no está autenticada o expiró. Iniciá sesión nuevamente.'
  if (status === 403) return 'No tenés permisos para consultar el historial de auditoría.'
  if (status === 502) return 'El historial de auditoría no está disponible en este momento.'
  return 'No se pudo cargar el historial de auditoría. Intentá nuevamente.'
}

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'UTC',
  }).format(new Date(value))
}

function formatChanges(value: Record<string, unknown> | null): string {
  return value === null ? 'Sin datos' : JSON.stringify(value, null, 2) ?? 'Sin datos'
}

export default function AuditPanel() {
  const [draft, setDraft] = useState<FilterDraft>({ ...EMPTY_DRAFT })
  const [filters, setFilters] = useState<AuditFilters>({})
  const [filterErrors, setFilterErrors] = useState<FilterErrors>({})
  const [cursor, setCursor] = useState<string | null>(null)
  const [pageSize, setPageSize] = useState(DEFAULT_PAGE_SIZE)
  const [pageNumber, setPageNumber] = useState(1)
  const [page, setPage] = useState<AuditPage | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>('loading')
  const [error, setError] = useState('')
  const [retryCount, setRetryCount] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    const query: AuditQuery = { ...filters, limit: pageSize }
    if (cursor !== null) query.cursor = cursor
    const search = new URLSearchParams()
    for (const [name, value] of Object.entries(query)) {
      if (value !== undefined) search.set(name, String(value))
    }

    setLoadState('loading')
    setError('')
    apiFetch(`${apiBaseUrl}/admin/audit?${search.toString()}`, {
      signal: controller.signal,
      waitForTokenAttempts: 1,
      waitForTokenTimeout: 5000,
    })
      .then(async (response) => {
        if (controller.signal.aborted) return
        if (!response.ok) {
          setError(errorMessage(response.status))
          setLoadState('error')
          return
        }
        const payload: unknown = await response.json()
        if (controller.signal.aborted) return
        if (!isAuditPage(payload)) {
          setError('La respuesta del historial de auditoría no tiene un formato válido.')
          setLoadState('error')
          return
        }
        setPage(payload)
        setLoadState('success')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        const notAuthenticated = reason instanceof Error
          && reason.message === 'Authentication token not available after retries'
        setError(notAuthenticated
          ? errorMessage(401)
          : errorMessage(0))
        setLoadState('error')
      })

    return () => controller.abort()
  }, [filters, cursor, pageSize, retryCount])

  function applyFilters(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = validateFilters(draft)
    setFilterErrors(result.errors)
    if (!result.filters) return
    setFilters(result.filters)
    setCursor(null)
    setPageNumber(1)
  }

  function resetFilters() {
    setDraft({ ...EMPTY_DRAFT })
    setFilterErrors({})
    setFilters({})
    setCursor(null)
    setPageNumber(1)
  }

  function updateDraft(name: FilterName, value: string) {
    setDraft((current) => ({ ...current, [name]: value }))
    setFilterErrors((current) => ({ ...current, [name]: undefined, date_range: undefined }))
  }

  function goToNextPage() {
    if (!page?.next_cursor) return
    setCursor(page.next_cursor)
    setPageNumber((current) => current + 1)
  }

  return (
    <main className="admin-audit">
      <h1>Historial de auditoría</h1>
      <p>Los cambios se muestran en orden descendente. Las fechas se consultan en UTC.</p>

      <form onSubmit={applyFilters} noValidate aria-label="Filtros del historial de auditoría">
        <div>
          {FIELD_CONFIG.map(({ name, label, maxLength, placeholder }) => {
            const errorId = `audit-${name}-error`
            const dateRangeError = (name === 'created_from' || name === 'created_to') && filterErrors.date_range
            return (
              <div key={name}>
                <label htmlFor={`audit-${name}`}>{label}</label>
                <input
                  id={`audit-${name}`}
                  name={name}
                  type="text"
                  value={draft[name]}
                  maxLength={maxLength}
                  placeholder={placeholder}
                  aria-invalid={Boolean(filterErrors[name] || dateRangeError)}
                  aria-describedby={[
                    filterErrors[name] ? errorId : null,
                    (name === 'created_from' || name === 'created_to') && filterErrors.date_range ? 'audit-date-range-error' : null,
                  ].filter(Boolean).join(' ') || undefined}
                  onChange={(event) => updateDraft(name, event.target.value)}
                />
                {filterErrors[name] ? <p className="field-error" id={errorId}>{filterErrors[name]}</p> : null}
              </div>
            )
          })}
        </div>
        {filterErrors.date_range ? <p className="field-error" id="audit-date-range-error" role="alert">{filterErrors.date_range}</p> : null}
        <button type="submit">Aplicar filtros</button>
        <button type="button" onClick={resetFilters}>Limpiar filtros</button>
      </form>

      <div className="admin-audit-page-size">
        <label htmlFor="audit-page-size">Registros por página</label>
        <select
          id="audit-page-size"
          value={pageSize}
          onChange={(event) => {
            setPageSize(Number(event.target.value))
            setCursor(null)
            setPageNumber(1)
          }}
        >
          <option value={DEFAULT_PAGE_SIZE}>{DEFAULT_PAGE_SIZE}</option>
          <option value={MAX_PAGE_SIZE}>{MAX_PAGE_SIZE}</option>
        </select>
      </div>

      {loadState === 'loading' ? <p role="status">Cargando historial de auditoría...</p> : null}
      {loadState === 'error' ? (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRetryCount((current) => current + 1)}>Reintentar</button>
        </div>
      ) : null}
      {loadState === 'success' && page?.items.length === 0 ? (
        <>
          <p role="status">No hay registros de auditoría para estos filtros.</p>
          {page.next_cursor ? <button type="button" onClick={goToNextPage}>Siguiente página</button> : null}
        </>
      ) : null}
      {loadState === 'success' && page && page.items.length > 0 ? (
        <>
          <p role="status">Página {pageNumber}</p>
          <div className="admin-table-scroll" role="region" aria-label="Tabla de registros de auditoría, desplazamiento horizontal disponible" tabIndex={0}>
          <table className="admin-table" aria-label="Registros de auditoría">
            <thead>
              <tr>
                <th scope="col">ID</th>
                <th scope="col">Actor</th>
                <th scope="col">Acción</th>
                <th scope="col">Entidad</th>
                <th scope="col">Fecha y hora (UTC)</th>
                <th scope="col">Cambios</th>
              </tr>
            </thead>
            <tbody>
              {page.items.map((record) => (
                <tr key={record.id}>
                  <th scope="row">{record.id}</th>
                  <td>{record.actor_id ?? '—'}</td>
                  <td>{record.action}</td>
                  <td>{record.entity_type ?? '—'}{record.entity_id === null ? '' : ` / ${record.entity_id}`}</td>
                  <td>{formatTimestamp(record.created_at)}</td>
                  <td>
                    <details>
                      <summary>Ver cambios</summary>
                      <dl>
                        <dt>Antes</dt>
                        <dd><pre>{formatChanges(record.changes.before)}</pre></dd>
                        <dt>Después</dt>
                        <dd><pre>{formatChanges(record.changes.after)}</pre></dd>
                      </dl>
                    </details>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
          <button type="button" onClick={goToNextPage} disabled={!page.next_cursor}>
            Siguiente página
          </button>
        </>
      ) : null}
    </main>
  )
}
