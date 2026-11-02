import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import apiFetch from '../../lib/apiClient'
import type { components } from '../../types/generated/bff-api'

type Promotion = components['schemas']['AdminPromotion']
type PromotionFields = components['schemas']['AdminPromotionFields']
type CreatePromotionRequest = Required<Pick<PromotionFields, 'name' | 'discount_percent' | 'product_bgg_id' | 'active'>>
type UpdatePromotionRequest = Pick<PromotionFields, 'name' | 'discount_percent' | 'product_bgg_id' | 'active'>
type Product = components['schemas']['Product']
type ProductOption = Pick<Product, 'bgg_id' | 'name' | 'price'>
type FieldErrors = Record<string, string>

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

function isProductOption(value: unknown): value is ProductOption {
  return typeof value === 'object'
    && value !== null
    && 'bgg_id' in value
    && typeof value.bgg_id === 'number'
    && 'name' in value
    && typeof value.name === 'string'
    && 'price' in value
    && typeof value.price === 'number'
    && Number.isFinite(value.price)
}

function readProductOptions(value: unknown): ProductOption[] | null {
  if (typeof value !== 'object' || value === null || !('items' in value) || !Array.isArray(value.items)) return null
  if (!('page' in value) || typeof value.page !== 'number'
    || !('page_size' in value) || typeof value.page_size !== 'number'
    || !('total' in value) || typeof value.total !== 'number'
    || !('total_pages' in value) || typeof value.total_pages !== 'number'
    || !value.items.every(isProductOption)) return null
  return value.items
}

function isPromotion(value: unknown): value is Promotion {
  if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string') return false
  return 'name' in value
    && typeof value.name === 'string'
    && 'discount_percent' in value
    && typeof value.discount_percent === 'number'
    && 'active' in value
    && typeof value.active === 'boolean'
    && (!('product_bgg_id' in value) || value.product_bgg_id === null || typeof value.product_bgg_id === 'number')
}

function isPromotionList(value: unknown): value is Promotion[] {
  return Array.isArray(value) && value.every(isPromotion)
}

function responseMessage(response: Response, fallback: string): string {
  if (response.status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.'
  if (response.status === 403) return 'No tenés permisos para administrar promociones.'
  if (response.status === 404) return 'No encontramos la promoción solicitada.'
  return fallback
}

function readFieldErrors(value: unknown): FieldErrors {
  if (typeof value !== 'object' || value === null || !('errors' in value) || !Array.isArray(value.errors)) return {}
  const errors: FieldErrors = {}
  for (const item of value.errors) {
    if (typeof item !== 'object' || item === null || !('field' in item) || typeof item.field !== 'string') continue
    if ('message' in item && typeof item.message === 'string') errors[item.field] = item.message
  }
  return errors
}

export default function PromotionForm() {
  const pathname = window.location.pathname
  const routeId = pathname.match(/^\/admin\/promotions\/([^/]+)$/)?.[1]
  const editingId = routeId && routeId !== 'new' ? routeId : undefined
  const isEditing = editingId !== undefined

  const [name, setName] = useState('')
  const [discountPercent, setDiscountPercent] = useState('')
  const [productBggId, setProductBggId] = useState('')
  const [active, setActive] = useState(false)
  const [products, setProducts] = useState<ProductOption[]>([])
  const [original, setOriginal] = useState<Promotion | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const selectedProduct = products.find((product) => product.bgg_id === Number(productBggId))
  const percentForPreview = Number(discountPercent)
  const canPreviewPrice = selectedProduct !== undefined
    && discountPercent !== ''
    && Number.isFinite(percentForPreview)
    && percentForPreview >= 0
    && percentForPreview <= 50
  const estimatedPrice = canPreviewPrice
    ? selectedProduct.price * (1 - percentForPreview / 100)
    : undefined
  const formatPrice = (price: number) => new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 2,
  }).format(price)

  useEffect(() => {
    const controller = new AbortController()
    const requestOptions = {
      signal: controller.signal,
      waitForTokenAttempts: 1,
      waitForTokenTimeout: 5000,
    }
    const productsRequest = apiFetch(`${apiBaseUrl}/admin/products?page=1&page_size=100`, requestOptions)
    const promotionsRequest = isEditing
      ? apiFetch(`${apiBaseUrl}/admin/promotions`, requestOptions)
      : Promise.resolve(null)

    Promise.all([productsRequest, promotionsRequest])
      .then(async ([productsResponse, promotionsResponse]) => {
        if (!productsResponse.ok) throw new Error(responseMessage(productsResponse, 'No se pudieron cargar los productos.'))
        const productsPayload: unknown = await productsResponse.json()
        const productOptions = readProductOptions(productsPayload)
        if (!productOptions) throw new Error('La respuesta de productos no es válida.')
        setProducts(productOptions)

        if (promotionsResponse) {
          if (!promotionsResponse.ok) throw new Error(responseMessage(promotionsResponse, 'No se pudieron cargar las promociones.'))
          const promotionsPayload: unknown = await promotionsResponse.json()
          if (!isPromotionList(promotionsPayload)) throw new Error('La respuesta de promociones no es válida.')
          const promotion = promotionsPayload.find((item) => item.id === editingId)
          if (!promotion) throw new Error('No encontramos la promoción solicitada.')
          setOriginal(promotion)
          setName(promotion.name)
          setDiscountPercent(String(promotion.discount_percent))
          setProductBggId(String(promotion.product_bgg_id ?? ''))
          setActive(promotion.active)
        }
        setLoadState('success')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(reason instanceof Error ? reason.message : 'No se pudo cargar el formulario.')
        setLoadState('error')
      })

    return () => controller.abort()
  }, [editingId, isEditing])

  const validate = (): boolean => {
    const next: FieldErrors = {}
    if (!name.trim()) next.name = 'El nombre es obligatorio.'

    const percent = Number(discountPercent)
    if (discountPercent === '' || !Number.isFinite(percent) || percent < 0 || percent > 50) {
      next.discount_percent = 'El descuento debe estar entre 0% y 50%, inclusive.'
    }

    const selectedProductId = Number(productBggId)
    if (productBggId !== '' && (!Number.isSafeInteger(selectedProductId) || selectedProductId <= 0
      || !products.some((product) => product.bgg_id === selectedProductId))) {
      next.product_bgg_id = 'Seleccioná un producto válido.'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setGlobalError(null)
    setSaved(false)
    if (!validate()) return

    const percent = Number(discountPercent)
    const selectedProductId = productBggId === '' ? null : Number(productBggId)
    let body: CreatePromotionRequest | UpdatePromotionRequest

    if (isEditing && original) {
      const changes: UpdatePromotionRequest = {}
      if (name.trim() !== original.name) changes.name = name.trim()
      if (percent !== original.discount_percent) changes.discount_percent = percent
      if (selectedProductId !== (original.product_bgg_id ?? null)) changes.product_bgg_id = selectedProductId
      if (active !== original.active) changes.active = active
      if (Object.keys(changes).length === 0) {
        setGlobalError('No hay cambios para guardar.')
        return
      }
      body = changes
    } else {
      body = {
        name: name.trim(),
        discount_percent: percent,
        product_bgg_id: selectedProductId,
        active,
      }
    }

    setSaving(true)
    setErrors({})
    try {
      const url = isEditing
        ? `${apiBaseUrl}/admin/promotions/${encodeURIComponent(editingId)}`
        : `${apiBaseUrl}/admin/promotions`
      const response = await apiFetch(url, {
        method: isEditing ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        waitForTokenAttempts: 1,
        waitForTokenTimeout: 5000,
      })

      if (!response.ok) {
        const responseBody: unknown = await response.json().catch(() => null)
        const serverErrors = readFieldErrors(responseBody)
        if (Object.keys(serverErrors).length > 0) setErrors(serverErrors)
        else setGlobalError(responseMessage(response, 'No se pudo guardar la promoción.'))
        return
      }

      setSaved(true)
    } catch (reason: unknown) {
      setGlobalError(reason instanceof Error ? reason.message : 'No se pudo conectar con el servicio.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="admin-promotion-form">
      <h1>{isEditing ? `Editar promoción ${editingId}` : 'Crear promoción'}</h1>
      {loadState === 'loading' ? <p role="status">Cargando datos de la promoción...</p> : null}
      {loadState === 'error' ? <p role="alert">{loadError}</p> : null}
      {loadState === 'success' ? (
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="promotion-name">Nombre</label>
          <input
            id="promotion-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            aria-invalid={Boolean(errors.name)}
            aria-describedby={errors.name ? 'promotion-name-error' : undefined}
          />
          {errors.name ? <p id="promotion-name-error" role="alert">{errors.name}</p> : null}

          <label htmlFor="promotion-product">Producto</label>
          <select
            id="promotion-product"
            value={productBggId}
            onChange={(event) => setProductBggId(event.target.value)}
            aria-invalid={Boolean(errors.product_bgg_id)}
            aria-describedby={errors.product_bgg_id ? 'promotion-product-error' : undefined}
          >
            <option value="">Todos los productos</option>
            {products.map((product) => <option key={product.bgg_id} value={product.bgg_id}>{product.name}</option>)}
          </select>
          {errors.product_bgg_id ? <p id="promotion-product-error" role="alert">{errors.product_bgg_id}</p> : null}

          <label htmlFor="promotion-discount">Descuento (%)</label>
          <input
            id="promotion-discount"
            type="number"
            min="0"
            max="50"
            step="any"
            value={discountPercent}
            onChange={(event) => setDiscountPercent(event.target.value)}
            required
            aria-invalid={Boolean(errors.discount_percent)}
            aria-describedby={errors.discount_percent ? 'promotion-discount-error' : undefined}
          />
          {errors.discount_percent ? <p id="promotion-discount-error" role="alert">{errors.discount_percent}</p> : null}

          {canPreviewPrice && estimatedPrice !== undefined ? (
            <section aria-label="Vista previa del precio promocional">
              <h2>Vista previa del precio promocional</h2>
              <p>Precio actual: {formatPrice(selectedProduct.price)}</p>
              <p role="status">Precio estimado con descuento: {formatPrice(estimatedPrice)}</p>
            </section>
          ) : null}

          <label htmlFor="promotion-active">
            <input id="promotion-active" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            Activa
          </label>

          {globalError ? <p role="alert">{globalError}</p> : null}
          {saved ? <p role="status">La promoción se guardó correctamente.</p> : null}
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      ) : null}
    </main>
  )
}
