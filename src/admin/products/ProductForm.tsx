import { useEffect, useState, type FormEvent } from 'react'
import apiFetch from '../../lib/apiClient'
import createAbortController from '../../lib/abort'
import type { components } from '../../types/generated/bff-api'
import StockAdjustmentForm from './StockAdjustmentForm'

type FieldErrors = Record<string, string>
type ProductDetails = components['schemas']['Product']
type ProductFields = components['schemas']['AdminProductFields']
type CreateProductRequest = ProductFields & Required<Pick<ProductFields, 'name' | 'price' | 'quantity'>>
type UpdateProductRequest = Omit<ProductFields, 'bgg_id' | 'quantity'>
type ServerFieldError = components['schemas']['AdminFieldErrorResponse']['errors'][number]

const PRODUCT_FIELD_NAMES = new Set([
  'name',
  'price',
  'quantity',
  'bgg_id',
  'release_year',
  'min_players',
  'max_players',
  'playing_time_minutes',
  'min_age',
  'max_age',
  'weight',
  'category',
  'publisher',
  'image_file_name',
  'image_url',
])

function isProductDetails(value: unknown): value is ProductDetails {
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

function isServerFieldError(value: unknown): value is ServerFieldError {
  if (typeof value !== 'object' || value === null) return false
  const error = value as Record<string, unknown>
  return typeof error.code === 'string'
    && typeof error.message === 'string'
    && (error.field === undefined || typeof error.field === 'string')
}

function parseServerErrors(value: unknown): FieldErrors {
  const errors: FieldErrors = {}
  const globalMessages: string[] = []

  if (typeof value === 'object' && value !== null && 'errors' in value
    && Array.isArray(value.errors) && value.errors.every(isServerFieldError)) {
    for (const error of value.errors) {
      if (error.field && PRODUCT_FIELD_NAMES.has(error.field)) {
        errors[error.field] = error.message
      } else {
        globalMessages.push(error.message)
      }
    }
  } else if (typeof value === 'object' && value !== null
    && 'error' in value && typeof value.error === 'string') {
    globalMessages.push(value.error)
  }

  if (globalMessages.length > 0) errors.__global = globalMessages.join(' ')
  if (Object.keys(errors).length === 0) errors.__global = 'Error de servidor'
  return errors
}

function parseOptionalNumber(
  value: string,
  field: string,
  minimum: number,
  errors: FieldErrors,
  integer = false,
): number | undefined {
  if (!value.trim()) return undefined
  const number = Number(value)
  if (!Number.isFinite(number) || number < minimum || (integer && !Number.isInteger(number))) {
    errors[field] = integer
      ? `Debe ser un número entero mayor o igual a ${minimum}`
      : `Debe ser un número mayor o igual a ${minimum}`
    return undefined
  }
  return number
}

function sameStrings(left: string[], right: string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index])
}

export default function ProductForm() {
  const pathname = window.location.pathname
  const parts = pathname.split('/').filter(Boolean)
  let editingId: string | undefined
  let isNew = false
  if (parts[0] === 'admin' && parts[1] === 'products') {
    if (parts[2] === 'new') isNew = true
    else if (parts[2]) editingId = parts[2]
  }

  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('0')
  const [currentQuantity, setCurrentQuantity] = useState<number | null>(null)
  const [bggId, setBggId] = useState('')
  const [releaseYear, setReleaseYear] = useState('')
  const [minPlayers, setMinPlayers] = useState('')
  const [maxPlayers, setMaxPlayers] = useState('')
  const [playingTimeMinutes, setPlayingTimeMinutes] = useState('')
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [weight, setWeight] = useState('')
  const [category, setCategory] = useState('')
  const [publisher, setPublisher] = useState('')
  const [imageFileName, setImageFileName] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [initialProduct, setInitialProduct] = useState<ProductDetails | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [loadingProduct, setLoadingProduct] = useState(Boolean(editingId))
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!editingId) return

    const productId = Number(editingId)
    if (!Number.isSafeInteger(productId) || productId < 1 || productId > 2147483647) {
      setLoadError('El identificador del producto no es válido')
      setLoadingProduct(false)
      return
    }

    const controller = createAbortController()
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

    void (async () => {
      try {
        const response = await apiFetch(`${base}/admin/products/${productId}`, {
          signal: controller.signal,
        })
        if (!response.ok) throw new Error('No se pudo cargar el producto')
        const payload: unknown = await response.json()
        if (!isProductDetails(payload)) throw new Error('La respuesta del producto no es válida')

        setInitialProduct(payload)
        setName(payload.name)
        setPrice(String(payload.price))
        setQuantity(String(payload.quantity))
        setCurrentQuantity(payload.quantity)
        setBggId(String(payload.bgg_id))
        setReleaseYear(String(payload.release_year))
        setMinPlayers(String(payload.min_players))
        setMaxPlayers(String(payload.max_players))
        setPlayingTimeMinutes(String(payload.playing_time_minutes))
        setMinAge(String(payload.min_age))
        setMaxAge('')
        setWeight(String(payload.weight))
        setCategory(payload.category.join(', '))
        setPublisher(payload.publisher)
        setImageFileName('')
        setImageUrl(payload.image_url)
      } catch (requestError: unknown) {
        if (controller.signal.aborted) return
        setLoadError(requestError instanceof Error
          ? requestError.message
          : 'No se pudo cargar el producto')
      } finally {
        if (!controller.signal.aborted) setLoadingProduct(false)
      }
    })()

    return () => controller.abort()
  }, [editingId])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next: FieldErrors = {}

    if (!name.trim()) next.name = 'El nombre es obligatorio'
    else if (name.trim().length > 250) next.name = 'El nombre no puede superar 250 caracteres'

    const parsedPrice = price.trim() ? Number(price) : Number.NaN
    if (!price.trim() || !Number.isFinite(parsedPrice) || parsedPrice <= 0) {
      next.price = 'El precio debe ser mayor que 0'
    }

    const parsedQuantity = parseOptionalNumber(quantity, 'quantity', 0, next, true)
    if (!editingId && !quantity.trim()) next.quantity = 'La cantidad es obligatoria'

    const parsedBggId = parseOptionalNumber(bggId, 'bgg_id', 1, next, true)
    const parsedReleaseYear = parseOptionalNumber(releaseYear, 'release_year', 1, next, true)
    const parsedMinPlayers = parseOptionalNumber(minPlayers, 'min_players', 1, next, true)
    const parsedMaxPlayers = parseOptionalNumber(maxPlayers, 'max_players', 1, next, true)
    const parsedPlayingTime = parseOptionalNumber(
      playingTimeMinutes,
      'playing_time_minutes',
      1,
      next,
      true,
    )
    const parsedMinAge = parseOptionalNumber(minAge, 'min_age', 0, next, true)
    const parsedMaxAge = parseOptionalNumber(maxAge, 'max_age', 0, next, true)
    const parsedWeight = parseOptionalNumber(weight, 'weight', 0, next)
    const imageFileNameValue = imageFileName.trim()
    const imageUrlValue = imageUrl.trim()
    const imageWasChanged = !editingId
      || imageUrlValue !== initialProduct?.image_url
      || imageFileNameValue.length > 0

    if (imageWasChanged) {
      const hasFileName = imageFileNameValue.length > 0
      const hasUrl = imageUrlValue.length > 0
      if (hasFileName === hasUrl) {
        next.image_file_name = 'Indica una sola referencia de imagen (.webp)'
        next.image_url = 'Indica una sola referencia de imagen (.webp)'
      }
      if (hasFileName && !/\.webp$/.test(imageFileNameValue)) {
        next.image_file_name = 'La referencia debe terminar en .webp'
      }
      if (hasUrl && !/\.webp$/.test(imageUrlValue)) {
        next.image_url = 'La referencia debe terminar en .webp'
      }
    }

    setErrors(next)
    if (Object.keys(next).length > 0) return

    const categories = category
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

    setSaving(true)
    try {
      let method: 'POST' | 'PUT'
      let url: string
      let body: CreateProductRequest | UpdateProductRequest

      if (editingId && initialProduct) {
        const changes: UpdateProductRequest = {}
        if (name.trim() !== initialProduct.name) changes.name = name.trim()
        if (parsedPrice !== initialProduct.price) changes.price = parsedPrice
        if (parsedReleaseYear !== undefined && parsedReleaseYear !== initialProduct.release_year) {
          changes.release_year = parsedReleaseYear
        }
        if (parsedMinPlayers !== undefined && parsedMinPlayers !== initialProduct.min_players) {
          changes.min_players = parsedMinPlayers
        }
        if (parsedMaxPlayers !== undefined && parsedMaxPlayers !== initialProduct.max_players) {
          changes.max_players = parsedMaxPlayers
        }
        if (
          parsedPlayingTime !== undefined
          && parsedPlayingTime !== initialProduct.playing_time_minutes
        ) {
          changes.playing_time_minutes = parsedPlayingTime
        }
        if (parsedMinAge !== undefined && parsedMinAge !== initialProduct.min_age) {
          changes.min_age = parsedMinAge
        }
        if (parsedMaxAge !== undefined) changes.max_age = parsedMaxAge
        if (parsedWeight !== undefined && parsedWeight !== initialProduct.weight) {
          changes.weight = parsedWeight
        }
        if (!sameStrings(categories, initialProduct.category)) changes.category = categories
        if (publisher.trim() !== initialProduct.publisher) changes.publisher = publisher.trim()
        if (imageUrlValue !== initialProduct.image_url || imageFileNameValue) {
          if (imageUrlValue) changes.image_url = imageUrlValue
          if (imageFileNameValue) changes.image_file_name = imageFileNameValue
        }

        if (Object.keys(changes).length === 0) {
          setErrors({ __global: 'No hay cambios para guardar.' })
          return
        }
        method = 'PUT'
        url = `${base}/admin/products/${editingId}`
        body = changes
      } else {
        const createBody: CreateProductRequest = {
          name: name.trim(),
          price: parsedPrice,
          quantity: parsedQuantity ?? 0,
          ...(parsedBggId === undefined ? {} : { bgg_id: parsedBggId }),
          ...(parsedReleaseYear === undefined ? {} : { release_year: parsedReleaseYear }),
          ...(parsedMinPlayers === undefined ? {} : { min_players: parsedMinPlayers }),
          ...(parsedMaxPlayers === undefined ? {} : { max_players: parsedMaxPlayers }),
          ...(parsedPlayingTime === undefined ? {} : { playing_time_minutes: parsedPlayingTime }),
          ...(parsedMinAge === undefined ? {} : { min_age: parsedMinAge }),
          ...(parsedMaxAge === undefined ? {} : { max_age: parsedMaxAge }),
          ...(parsedWeight === undefined ? {} : { weight: parsedWeight }),
          ...(categories.length === 0 ? {} : { category: categories }),
          ...(publisher.trim() ? { publisher: publisher.trim() } : {}),
          ...(imageFileNameValue ? { image_file_name: imageFileNameValue } : {}),
          ...(imageUrlValue ? { image_url: imageUrlValue } : {}),
        }
        method = 'POST'
        url = `${base}/admin/products`
        body = createBody
      }

      const response = await apiFetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!response.ok) {
        let payload: unknown
        try {
          payload = await response.json()
        } catch {
          payload = undefined
        }
        setErrors(parseServerErrors(payload))
        return
      }

      window.location.href = '/admin/products'
    } catch {
      setErrors({ __global: 'No se pudo conectar con el servicio' })
    } finally {
      setSaving(false)
    }
  }

  const fieldError = (field: string) => errors[field]

  return (
    <main className="admin-product-form">
      <h1>{editingId ? `Editar producto ${editingId}` : isNew ? 'Crear producto' : 'Producto'}</h1>
      {loadError && <div role="alert">{loadError}</div>}
      {loadingProduct && <div role="status">Cargando producto...</div>}
      {!loadingProduct && !loadError && (
        <form onSubmit={handleSubmit} noValidate aria-busy={saving}>
          <label htmlFor="product-name">Nombre
            <input
              id="product-name"
              value={name}
              maxLength={250}
              required
              aria-invalid={Boolean(fieldError('name'))}
              aria-describedby={fieldError('name') ? 'product-name-error' : undefined}
              onChange={(event) => setName(event.target.value)}
            />
            {fieldError('name') && <p id="product-name-error" role="alert">{fieldError('name')}</p>}
          </label>
          <label htmlFor="product-bggid">BGG ID
            <input
              id="product-bggid"
              type="number"
              min={1}
              step={1}
              value={bggId}
              readOnly={Boolean(editingId)}
              aria-invalid={Boolean(fieldError('bgg_id'))}
              aria-describedby={fieldError('bgg_id') ? 'product-bggid-error' : undefined}
              onChange={(event) => setBggId(event.target.value)}
            />
            {fieldError('bgg_id') && <p id="product-bggid-error" role="alert">{fieldError('bgg_id')}</p>}
          </label>
          <label htmlFor="product-release-year">Año
            <input
              id="product-release-year"
              type="number"
              min={1}
              step={1}
              value={releaseYear}
              aria-invalid={Boolean(fieldError('release_year'))}
              aria-describedby={fieldError('release_year') ? 'product-release-year-error' : undefined}
              onChange={(event) => setReleaseYear(event.target.value)}
            />
            {fieldError('release_year') && (
              <p id="product-release-year-error" role="alert">{fieldError('release_year')}</p>
            )}
          </label>
          <label htmlFor="product-min-players">Jugadores min
            <input
              id="product-min-players"
              type="number"
              min={1}
              step={1}
              value={minPlayers}
              aria-invalid={Boolean(fieldError('min_players'))}
              aria-describedby={fieldError('min_players') ? 'product-min-players-error' : undefined}
              onChange={(event) => setMinPlayers(event.target.value)}
            />
            {fieldError('min_players') && (
              <p id="product-min-players-error" role="alert">{fieldError('min_players')}</p>
            )}
          </label>
          <label htmlFor="product-max-players">Jugadores max
            <input
              id="product-max-players"
              type="number"
              min={1}
              step={1}
              value={maxPlayers}
              aria-invalid={Boolean(fieldError('max_players'))}
              aria-describedby={fieldError('max_players') ? 'product-max-players-error' : undefined}
              onChange={(event) => setMaxPlayers(event.target.value)}
            />
            {fieldError('max_players') && (
              <p id="product-max-players-error" role="alert">{fieldError('max_players')}</p>
            )}
          </label>
          <label htmlFor="product-playing-time">Tiempo (min)
            <input
              id="product-playing-time"
              type="number"
              min={1}
              step={1}
              value={playingTimeMinutes}
              aria-invalid={Boolean(fieldError('playing_time_minutes'))}
              aria-describedby={fieldError('playing_time_minutes') ? 'product-playing-time-error' : undefined}
              onChange={(event) => setPlayingTimeMinutes(event.target.value)}
            />
            {fieldError('playing_time_minutes') && (
              <p id="product-playing-time-error" role="alert">{fieldError('playing_time_minutes')}</p>
            )}
          </label>
          <label htmlFor="product-min-age">Edad mínima
            <input
              id="product-min-age"
              type="number"
              min={0}
              step={1}
              value={minAge}
              aria-invalid={Boolean(fieldError('min_age'))}
              aria-describedby={fieldError('min_age') ? 'product-min-age-error' : undefined}
              onChange={(event) => setMinAge(event.target.value)}
            />
            {fieldError('min_age') && <p id="product-min-age-error" role="alert">{fieldError('min_age')}</p>}
          </label>
          <label htmlFor="product-max-age">Edad máxima
            <input
              id="product-max-age"
              type="number"
              min={0}
              step={1}
              value={maxAge}
              aria-invalid={Boolean(fieldError('max_age'))}
              aria-describedby={fieldError('max_age') ? 'product-max-age-error' : undefined}
              onChange={(event) => setMaxAge(event.target.value)}
            />
            {fieldError('max_age') && <p id="product-max-age-error" role="alert">{fieldError('max_age')}</p>}
          </label>
          <label htmlFor="product-weight">Peso
            <input
              id="product-weight"
              type="number"
              min={0}
              step="any"
              value={weight}
              aria-invalid={Boolean(fieldError('weight'))}
              aria-describedby={fieldError('weight') ? 'product-weight-error' : undefined}
              onChange={(event) => setWeight(event.target.value)}
            />
            {fieldError('weight') && <p id="product-weight-error" role="alert">{fieldError('weight')}</p>}
          </label>
          <label htmlFor="product-category">Categorías (coma-separadas)
            <input
              id="product-category"
              value={category}
              aria-invalid={Boolean(fieldError('category'))}
              aria-describedby={fieldError('category') ? 'product-category-error' : undefined}
              onChange={(event) => setCategory(event.target.value)}
            />
            {fieldError('category') && <p id="product-category-error" role="alert">{fieldError('category')}</p>}
          </label>
          <label htmlFor="product-publisher">Editorial
            <input
              id="product-publisher"
              value={publisher}
              aria-invalid={Boolean(fieldError('publisher'))}
              aria-describedby={fieldError('publisher') ? 'product-publisher-error' : undefined}
              onChange={(event) => setPublisher(event.target.value)}
            />
            {fieldError('publisher') && <p id="product-publisher-error" role="alert">{fieldError('publisher')}</p>}
          </label>
          <label htmlFor="product-image-file">Nombre o ruta de imagen (.webp)
            <input
              id="product-image-file"
              value={imageFileName}
              aria-invalid={Boolean(fieldError('image_file_name'))}
              aria-describedby={fieldError('image_file_name') ? 'product-image-file-error' : undefined}
              onChange={(event) => setImageFileName(event.target.value)}
            />
            {fieldError('image_file_name') && (
              <p id="product-image-file-error" role="alert">{fieldError('image_file_name')}</p>
            )}
          </label>
          <label htmlFor="product-image-url">URL de imagen (.webp)
            <input
              id="product-image-url"
              value={imageUrl}
              aria-invalid={Boolean(fieldError('image_url'))}
              aria-describedby={fieldError('image_url') ? 'product-image-url-error' : undefined}
              onChange={(event) => setImageUrl(event.target.value)}
            />
            {fieldError('image_url') && <p id="product-image-url-error" role="alert">{fieldError('image_url')}</p>}
          </label>
          <label htmlFor="product-price">Precio
            <input
              id="product-price"
              type="number"
              min="0.01"
              step="any"
              value={price}
              required
              aria-invalid={Boolean(fieldError('price'))}
              aria-describedby={fieldError('price') ? 'product-price-error' : undefined}
              onChange={(event) => setPrice(event.target.value)}
            />
            {fieldError('price') && <p id="product-price-error" role="alert">{fieldError('price')}</p>}
          </label>
          {!editingId && (
            <label htmlFor="product-quantity">Cantidad
              <input
                id="product-quantity"
                type="number"
                min={0}
                step={1}
                value={quantity}
                required
                aria-invalid={Boolean(fieldError('quantity'))}
                aria-describedby={fieldError('quantity') ? 'product-quantity-error' : undefined}
                onChange={(event) => setQuantity(event.target.value)}
              />
              {fieldError('quantity') && (
                <p id="product-quantity-error" role="alert">{fieldError('quantity')}</p>
              )}
            </label>
          )}
          {errors.__global && <p role="alert">{errors.__global}</p>}
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      )}
      {editingId && currentQuantity !== null && (
        <section aria-labelledby="product-inventory-title">
          <h2 id="product-inventory-title">Inventario</h2>
          <p>{currentQuantity === 0 ? 'Sin stock' : `Existencias actuales: ${currentQuantity}`}</p>
        </section>
      )}
      {editingId && Number.isSafeInteger(Number(editingId)) && Number(editingId) > 0 && (
        <StockAdjustmentForm
          key={editingId}
          productId={Number(editingId)}
          onApplied={setCurrentQuantity}
        />
      )}
    </main>
  )
}
