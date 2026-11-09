import { useEffect, useState, type FormEvent } from 'react'
import apiFetch from '../../lib/apiClient'
import type { components } from '../../types/generated/bff-api'
import './SalesPanel.css'

type SalesMetrics = components['schemas']['AdminSalesMetrics']

type DraftFilters = {
  from: string
  to: string
  category: string
  productIds: string
}

type AppliedFilters = {
  from: string
  to: string
  category: string
  productIds: number[]
}

const EMPTY_FILTERS: DraftFilters = { from: '', to: '', category: '', productIds: '' }
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
const currencyFormatter = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isStatusCount(value: unknown): value is SalesMetrics['orders_by_dispatch_status'][number] {
  return isRecord(value)
    && typeof value.status === 'string'
    && typeof value.count === 'number'
    && Number.isSafeInteger(value.count)
    && value.count >= 0
}

function isSalesMetrics(value: unknown): value is SalesMetrics {
  if (!isRecord(value)) return false
  return typeof value.revenue_total === 'number'
    && Number.isFinite(value.revenue_total)
    && typeof value.orders_count === 'number'
    && Number.isSafeInteger(value.orders_count)
    && value.orders_count >= 0
    && Array.isArray(value.top_products)
    && value.top_products.every((product) => isRecord(product)
      && typeof product.bgg_id === 'number'
      && Number.isSafeInteger(product.bgg_id)
      && typeof product.name === 'string'
      && typeof product.units === 'number'
      && Number.isSafeInteger(product.units)
      && typeof product.revenue === 'number'
      && Number.isFinite(product.revenue))
    && Array.isArray(value.orders_by_dispatch_status)
    && value.orders_by_dispatch_status.every(isStatusCount)
    && Array.isArray(value.orders_by_payment_status)
    && value.orders_by_payment_status.every(isStatusCount)
    && Array.isArray(value.revenue_by_day)
    && value.revenue_by_day.every((day) => isRecord(day)
      && typeof day.date === 'string'
      && Number.isFinite(Date.parse(day.date))
      && typeof day.revenue === 'number'
      && Number.isFinite(day.revenue))
}

function toUtcIso(value: string): string {
  const withSeconds = value.length === 16 ? `${value}:00` : value
  return new Date(`${withSeconds}Z`).toISOString()
}

function buildMetricsUrl(filters: AppliedFilters | null): string {
  const params = new URLSearchParams()
  if (filters) {
    if (filters.from && filters.to) {
      params.append('from', toUtcIso(filters.from))
      params.append('to', toUtcIso(filters.to))
    }
    if (filters.category) params.append('category', filters.category)
    filters.productIds.forEach((productId) => params.append('product_id', String(productId)))
  }
  const query = params.toString()
  return `${apiBaseUrl}/admin/sales-metrics${query ? `?${query}` : ''}`
}

function safeResponseMessage(status: number, resource: 'metrics' | 'categories'): string {
  if (status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.'
  if (status === 403) return 'No tenés permisos para consultar las métricas de ventas.'
  return resource === 'categories'
    ? 'No se pudieron cargar las categorías de ventas.'
    : 'No se pudieron cargar las métricas de ventas.'
}

function formatCurrency(value: number): string {
  return currencyFormatter.format(value)
}

function getChartPoints(metrics: SalesMetrics): string {
  const days = metrics.revenue_by_day
  const maximum = Math.max(...days.map((day) => day.revenue), 1)
  return days.map((day, index) => {
    const x = 24 + index * (552 / Math.max(days.length - 1, 1))
    const y = 176 - (day.revenue / maximum) * 144
    return `${x},${y}`
  }).join(' ')
}

function StatusList({ id, title, statuses }: { id: string; title: string; statuses: SalesMetrics['orders_by_dispatch_status'] }) {
  return (
    <section className="sales-section sales-status-section" aria-labelledby={`${id}-heading`}>
      <h2 id={`${id}-heading`}>{title}</h2>
      {statuses.length > 0 ? (
        <ul className="sales-status-list">
          {statuses.map((status) => (
            <li key={status.status}>
              <span>{status.status}</span>
              <strong>{status.count.toLocaleString('es-AR')} {status.count === 1 ? 'orden' : 'órdenes'}</strong>
            </li>
          ))}
        </ul>
      ) : <p className="sales-muted">Sin datos en el período seleccionado.</p>}
    </section>
  )
}

export default function SalesPanel() {
  const [draftFilters, setDraftFilters] = useState<DraftFilters>(EMPTY_FILTERS)
  const [activeFilters, setActiveFilters] = useState<AppliedFilters | null>(null)
  const [metrics, setMetrics] = useState<SalesMetrics | null>(null)
  const [categories, setCategories] = useState<string[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [filterError, setFilterError] = useState<string | null>(null)
  const [retryCount, setRetryCount] = useState(0)
  const metricsUrl = buildMetricsUrl(activeFilters)

  useEffect(() => {
    const controller = new AbortController()
    let ignore = false
    setLoadState('loading')
    setError(null)

    void (async () => {
      let safeError = 'No se pudieron cargar las métricas de ventas.'
      try {
        const [metricsResponse, categoriesResponse] = await Promise.all([
          apiFetch(metricsUrl, { signal: controller.signal }),
          apiFetch(`${apiBaseUrl}/admin/sales-metrics/categories`, { signal: controller.signal }),
        ])

        if (!metricsResponse.ok) {
          safeError = safeResponseMessage(metricsResponse.status, 'metrics')
          throw new Error()
        }
        if (!categoriesResponse.ok) {
          safeError = safeResponseMessage(categoriesResponse.status, 'categories')
          throw new Error()
        }

        const [metricsPayload, categoriesPayload]: [unknown, unknown] = await Promise.all([
          metricsResponse.json(),
          categoriesResponse.json(),
        ])
        if (!isSalesMetrics(metricsPayload)) {
          safeError = 'La respuesta de métricas de ventas no es válida.'
          throw new Error()
        }
        if (!Array.isArray(categoriesPayload) || !categoriesPayload.every((category) => typeof category === 'string')) {
          safeError = 'La respuesta de categorías de ventas no es válida.'
          throw new Error()
        }
        if (ignore) return
        setMetrics(metricsPayload)
        setCategories(categoriesPayload)
        setLoadState('success')
      } catch {
        if (ignore || controller.signal.aborted) return
        setError(safeError)
        setLoadState('error')
      }
    })()

    return () => {
      ignore = true
      controller.abort()
    }
  }, [metricsUrl, retryCount])

  const updateDraft = (field: keyof DraftFilters, value: string) => {
    setDraftFilters((current) => ({ ...current, [field]: value }))
  }

  const handleApplyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setFilterError(null)
    if (Boolean(draftFilters.from) !== Boolean(draftFilters.to)) {
      setFilterError('Completá las dos fechas para filtrar por período.')
      return
    }

    let from = ''
    let to = ''
    if (draftFilters.from && draftFilters.to) {
      try {
        from = toUtcIso(draftFilters.from)
        to = toUtcIso(draftFilters.to)
      } catch {
        setFilterError('Ingresá un período válido en UTC.')
        return
      }
      if (Date.parse(from) >= Date.parse(to)) {
        setFilterError('La fecha Hasta debe ser posterior a Desde.')
        return
      }
    }

    const productIdsText = draftFilters.productIds.trim()
    const productIds = productIdsText
      ? productIdsText.split(',').map((productId) => Number(productId.trim()))
      : []
    if (productIds.some((productId) => !Number.isSafeInteger(productId) || productId < 1 || productId > 2147483647)) {
      setFilterError('Ingresá IDs de producto válidos, separados por comas.')
      return
    }

    setActiveFilters({
      from: draftFilters.from,
      to: draftFilters.to,
      category: draftFilters.category,
      productIds,
    })
  }

  const hasSales = metrics !== null && (metrics.revenue_total !== 0
    || metrics.orders_count !== 0
    || metrics.top_products.length > 0
    || metrics.orders_by_dispatch_status.length > 0
    || metrics.orders_by_payment_status.length > 0
    || metrics.revenue_by_day.length > 0)

  return (
    <main className="sales-panel">
      <header className="sales-header">
        <div>
          <p className="sales-eyebrow">Administración</p>
          <h1>Métricas de ventas</h1>
        </div>
      </header>

      <form className="sales-filters" aria-label="Filtros de ventas" onSubmit={handleApplyFilters}>
        <label htmlFor="sales-from">
          Desde (UTC)
          <input
            id="sales-from"
            name="from"
            type="datetime-local"
            step={60}
            value={draftFilters.from}
            onChange={(event) => updateDraft('from', event.target.value)}
          />
        </label>
        <label htmlFor="sales-to">
          Hasta (UTC)
          <input
            id="sales-to"
            name="to"
            type="datetime-local"
            step={60}
            value={draftFilters.to}
            onChange={(event) => updateDraft('to', event.target.value)}
          />
        </label>
        <label htmlFor="sales-category">
          Categoría
          <select
            id="sales-category"
            name="category"
            value={draftFilters.category}
            onChange={(event) => updateDraft('category', event.target.value)}
          >
            <option value="">Todas las categorías</option>
            {categories.map((category) => <option key={category} value={category}>{category}</option>)}
          </select>
        </label>
        <div className="sales-product-filter">
          <label htmlFor="sales-product-ids">ID del producto</label>
          <input
            id="sales-product-ids"
            name="product_id"
            type="text"
            inputMode="numeric"
            value={draftFilters.productIds}
            aria-describedby="sales-product-hint"
            onChange={(event) => updateDraft('productIds', event.target.value)}
          />
          <span id="sales-product-hint" className="sales-field-hint">Separá varios IDs con comas.</span>
        </div>
        <button className="sales-apply-button" type="submit">Aplicar filtros</button>
        {filterError ? <p className="sales-filter-error" role="alert">{filterError}</p> : null}
      </form>

      {loadState === 'loading' ? <p className="sales-message" role="status">Cargando métricas...</p> : null}
      {loadState === 'error' ? (
        <div className="sales-error" role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRetryCount((count) => count + 1)}>Reintentar</button>
        </div>
      ) : null}

      {loadState === 'success' && metrics ? (
        <div className="sales-results">
          {!hasSales ? <p className="sales-empty" role="status">No hay ventas en el período seleccionado.</p> : null}

          <section className="sales-summary" aria-label="Resumen de ventas">
            <div className="sales-summary-item">
              <span>Ingresos totales</span>
              <strong>{formatCurrency(metrics.revenue_total)}</strong>
              <small>ARS</small>
            </div>
            <div className="sales-summary-item">
              <span>Órdenes pagadas</span>
              <strong>{metrics.orders_count.toLocaleString('es-AR')}</strong>
            </div>
          </section>

          <section className="sales-section" aria-labelledby="sales-top-products-heading">
            <h2 id="sales-top-products-heading">Productos más vendidos</h2>
            {metrics.top_products.length > 0 ? (
              <div className="sales-table-wrap" role="region" aria-label="Tabla de productos más vendidos, desplazamiento horizontal disponible" tabIndex={0}>
                <table className="sales-table" aria-label="Productos más vendidos">
                  <thead>
                    <tr>
                      <th scope="col">Producto</th>
                      <th scope="col">ID BGG</th>
                      <th scope="col">Unidades</th>
                      <th scope="col">Ingresos</th>
                    </tr>
                  </thead>
                  <tbody>
                    {metrics.top_products.map((product) => (
                      <tr key={product.bgg_id}>
                        <th scope="row">{product.name}</th>
                        <td>{product.bgg_id}</td>
                        <td>{product.units.toLocaleString('es-AR')}</td>
                        <td>ARS {formatCurrency(product.revenue)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="sales-muted">Sin productos para mostrar.</p>}
          </section>

          <div className="sales-detail-grid">
            <StatusList id="dispatch-status" title="Estado de despacho" statuses={metrics.orders_by_dispatch_status} />
            <StatusList id="payment-status" title="Estado de pago" statuses={metrics.orders_by_payment_status} />
          </div>

          <section className="sales-section" aria-labelledby="sales-revenue-chart-heading">
            <h2 id="sales-revenue-chart-heading">Ingresos por día</h2>
            {metrics.revenue_by_day.length > 0 ? (
              <div className="sales-chart-wrap">
                <svg className="sales-chart" viewBox="0 0 600 210" role="img" aria-label="Gráfico de ingresos diarios">
                  <title>Ingresos por día</title>
                  <line x1="20" y1="176" x2="580" y2="176" className="sales-chart-axis" />
                  <polyline points={getChartPoints(metrics)} className="sales-chart-line" />
                  {metrics.revenue_by_day.map((day, index) => {
                    const maximum = Math.max(...metrics.revenue_by_day.map((item) => item.revenue), 1)
                    const x = 24 + index * (552 / Math.max(metrics.revenue_by_day.length - 1, 1))
                    const y = 176 - (day.revenue / maximum) * 144
                    return (
                      <circle key={day.date} cx={x} cy={y} r="4" className="sales-chart-point">
                        <title>{`${day.date}: ${formatCurrency(day.revenue)} ARS`}</title>
                      </circle>
                    )
                  })}
                </svg>
                <div className="sales-chart-labels" aria-hidden="true">
                  <span>{metrics.revenue_by_day[0].date}</span>
                  <span>{metrics.revenue_by_day[metrics.revenue_by_day.length - 1].date}</span>
                </div>
              </div>
            ) : <p className="sales-muted">Sin ingresos diarios para mostrar.</p>}
          </section>
        </div>
      ) : null}
    </main>
  )
}