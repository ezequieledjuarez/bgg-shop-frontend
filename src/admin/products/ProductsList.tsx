import { useEffect, useState, type FormEvent } from 'react'
import apiFetch from '../../lib/apiClient'
import type { components, paths } from '../../types/generated/bff-api'
import { uiRoutes } from '../../routing/routes'

type Product = components['schemas']['Product']
type ProductPage = components['schemas']['AdminProductPage']
type AdminProductQuery = NonNullable<paths['/api/v1/admin/products']['get']['parameters']['query']>

type Filters = {
  search: string
  year_published: string
  min_players: string
  max_players: string
  category_id: string
  price_min: string
  price_max: string
}

const EMPTY_FILTERS: Filters = {
  search: '',
  year_published: '',
  min_players: '',
  max_players: '',
  category_id: '',
  price_min: '',
  price_max: '',
}

function isProduct(value: unknown): value is Product {
  if (typeof value !== 'object' || value === null) return false
  const product = value as Record<string, unknown>
  return typeof product.bgg_id === 'number'
    && typeof product.name === 'string'
    && typeof product.release_year === 'number'
    && typeof product.min_players === 'number'
    && typeof product.max_players === 'number'
    && typeof product.playing_time_minutes === 'number'
    && typeof product.min_age === 'number'
    && typeof product.weight === 'number'
    && Array.isArray(product.category)
    && product.category.every((item) => typeof item === 'string')
    && typeof product.price === 'number'
    && typeof product.publisher === 'string'
    && typeof product.image_url === 'string'
    && typeof product.quantity === 'number'
}

function isProductPage(value: unknown): value is ProductPage {
  if (typeof value !== 'object' || value === null) return false
  const page = value as Record<string, unknown>
  return Array.isArray(page.items)
    && page.items.every(isProduct)
    && Number.isInteger(page.page)
    && Number(page.page) >= 1
    && Number.isInteger(page.page_size)
    && Number(page.page_size) >= 1
    && Number(page.page_size) <= 200
    && Number.isInteger(page.total)
    && Number(page.total) >= 0
    && Number.isInteger(page.total_pages)
    && Number(page.total_pages) >= 0
}

function isErrorResponse(value: unknown): value is components['schemas']['AdminErrorResponse'] {
  return typeof value === 'object'
    && value !== null
    && 'error' in value
    && typeof value.error === 'string'
}

function makeRequestUrl(
  baseUrl: string,
  page: number,
  pageSize: number,
  filters: Filters,
): string {
  const query: AdminProductQuery = {
    page,
    page_size: pageSize,
    ...(filters.search.trim() ? { search: filters.search.trim() } : {}),
    ...(filters.year_published ? { year_published: Number(filters.year_published) } : {}),
    ...(filters.min_players ? { min_players: Number(filters.min_players) } : {}),
    ...(filters.max_players ? { max_players: Number(filters.max_players) } : {}),
    ...(filters.category_id ? { category_id: Number(filters.category_id) } : {}),
    ...(filters.price_min ? { price_min: Number(filters.price_min) } : {}),
    ...(filters.price_max ? { price_max: Number(filters.price_max) } : {}),
  }
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined) params.set(key, String(value))
  }
  return `${baseUrl}/admin/products?${params.toString()}`
}

export default function ProductsList() {
  const [draftFilters, setDraftFilters] = useState<Filters>(EMPTY_FILTERS)
  const [activeFilters, setActiveFilters] = useState<Filters>(EMPTY_FILTERS)
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(50)
  const [pageData, setPageData] = useState<ProductPage | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const baseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
  const requestUrl = makeRequestUrl(baseUrl, page, pageSize, activeFilters)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)

    void (async () => {
      let failureMessage = 'No se pudo cargar la lista de productos'
      try {
        const response = await apiFetch(requestUrl, { signal: controller.signal })
        if (!response.ok) {
          try {
            const body: unknown = await response.json()
            if (isErrorResponse(body)) failureMessage = body.error
          } catch {
            // Use the stable fallback when the response is not valid JSON.
          }
          throw new Error(failureMessage)
        }

        const payload: unknown = await response.json()
        if (!isProductPage(payload)) {
          failureMessage = 'La respuesta de productos no es válida'
          throw new Error(failureMessage)
        }
        setPageData(payload)
      } catch {
        if (controller.signal.aborted) return
        setError(failureMessage)
      } finally {
        if (!controller.signal.aborted) setLoading(false)
      }
    })()

    return () => controller.abort()
  }, [requestUrl, retry])

  const updateDraft = (field: keyof Filters, value: string) => {
    setDraftFilters((current) => ({ ...current, [field]: value }))
  }

  const handleSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setPage(1)
    setActiveFilters({ ...draftFilters })
  }

  const hasProducts = Boolean(pageData?.items.length)
  const canGoBack = pageData !== null && page > 1
  const canGoForward = pageData !== null && page < pageData.total_pages

  return (
    <main className="admin-products">
      <h1>Productos (Admin)</h1>
      <a className="primary-button" href={uiRoutes.admin.newProduct}>Crear producto</a>

      <form className="admin-product-filters" onSubmit={handleSearch}>
        <label htmlFor="products-search">Buscar por nombre o editorial</label>
        <input
          id="products-search"
          name="search"
          type="search"
          maxLength={200}
          value={draftFilters.search}
          onChange={(event) => updateDraft('search', event.target.value)}
        />
        <label htmlFor="products-year">Año de publicación</label>
        <input
          id="products-year"
          name="year_published"
          type="number"
          min={0}
          max={9999}
          step={1}
          value={draftFilters.year_published}
          onChange={(event) => updateDraft('year_published', event.target.value)}
        />
        <label htmlFor="products-min-players">Mínimo de jugadores</label>
        <input
          id="products-min-players"
          name="min_players"
          type="number"
          min={1}
          max={999}
          step={1}
          value={draftFilters.min_players}
          onChange={(event) => updateDraft('min_players', event.target.value)}
        />
        <label htmlFor="products-max-players">Máximo de jugadores</label>
        <input
          id="products-max-players"
          name="max_players"
          type="number"
          min={1}
          max={999}
          step={1}
          value={draftFilters.max_players}
          onChange={(event) => updateDraft('max_players', event.target.value)}
        />
        <label htmlFor="products-category">Categoría (ID)</label>
        <select
          id="products-category"
          name="category_id"
          value={draftFilters.category_id}
          onChange={(event) => updateDraft('category_id', event.target.value)}
        >
          <option value="">Todas las categorías</option>
          <option value="1">Estrategia</option>
          <option value="2">Temática</option>
          <option value="3">Familiar</option>
        </select>
        <label htmlFor="products-price-min">Precio mínimo</label>
        <input
          id="products-price-min"
          name="price_min"
          type="number"
          min={0}
          step="any"
          value={draftFilters.price_min}
          onChange={(event) => updateDraft('price_min', event.target.value)}
        />
        <label htmlFor="products-price-max">Precio máximo</label>
        <input
          id="products-price-max"
          name="price_max"
          type="number"
          min={0}
          step="any"
          value={draftFilters.price_max}
          onChange={(event) => updateDraft('price_max', event.target.value)}
        />
        <label htmlFor="products-page-size">Productos por página</label>
        <select
          id="products-page-size"
          value={pageSize}
          onChange={(event) => {
            setPage(1)
            setPageSize(Number(event.target.value))
          }}
        >
          {[20, 50, 100, 200].map((size) => (
            <option key={size} value={size}>{size}</option>
          ))}
        </select>
        <button type="submit">Aplicar filtros</button>
      </form>

      {loading && <div role="status">Cargando productos...</div>}
      {error && (
        <div role="alert">
          <p>{error}</p>
          <button type="button" onClick={() => setRetry((current) => current + 1)}>
            Reintentar
          </button>
        </div>
      )}
      {!loading && !error && !hasProducts && (
        <p role="status">No se encontraron productos.</p>
      )}

      {!loading && !error && hasProducts && pageData && (
        <div className="admin-table-scroll" role="region" aria-label="Tabla de productos, desplazamiento horizontal disponible" tabIndex={0}>
        <table className="admin-table" aria-label="Productos">
          <thead>
            <tr>
              <th scope="col">Id</th>
              <th scope="col">Nombre</th>
              <th scope="col">Precio</th>
              <th scope="col">Stock</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {pageData.items.map((product) => (
              <tr key={product.bgg_id}>
                <td>{product.bgg_id}</td>
                <td>{product.name}</td>
                <td>
                  {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(product.price)}
                </td>
                <td>{product.quantity}</td>
                <td><a href={`${uiRoutes.admin.products}/${product.bgg_id}`}>Editar</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      )}

      {pageData && pageData.total_pages > 0 && (
        <nav aria-label="Paginación de productos">
          <p>
            Página {pageData.page} de {pageData.total_pages} ({pageData.total} productos)
          </p>
          <button
            type="button"
            disabled={loading || !canGoBack}
            onClick={() => setPage((current) => Math.max(1, current - 1))}
          >
            Anterior
          </button>
          <button
            type="button"
            disabled={loading || !canGoForward}
            onClick={() => setPage((current) => current + 1)}
          >
            Siguiente
          </button>
        </nav>
      )}
    </main>
  )
}
