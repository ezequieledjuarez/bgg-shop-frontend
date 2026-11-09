import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { LoginScreen, RegisterScreen } from './auth/AuthScreens';
import { ADMIN_AUTHORIZATION_DENIED_EVENT, SESSION_CHANGE_EVENT, SESSION_STORAGE_KEY } from './auth/session';
import {
  AdminCapabilitiesError,
  fetchAdminCapabilities,
  type AdminCapabilities,
} from './auth/adminCapabilities'
import './App.css';
import type { components, operations } from './types/generated/bff-api'
import { cartErrorMessage, cartMessages, reviewErrorMessage } from './ui/messages'
import { CheckoutScreen } from './checkout/CheckoutScreen'
import { OrdersScreen, PurchaseResultScreen } from './checkout/OrdersScreen'
import { WishlistScreen } from './wishlist/WishlistScreen'
import AdminRouter from './admin/AdminRouter'
import Chatbot from './chatbot/Chatbot'
import { refreshSession } from './lib/api'
import {
  catalogUrl,
  emptyCatalogUrlState,
  readCatalogUrlState,
  type CatalogUrlState,
} from './catalog/urlState'
import { canonicalizeUiPath, uiRoutes } from './routing/routes'

type SortOrder = CatalogUrlState['sort']

type Product = components['schemas']['Product']
type ProductPage = components['schemas']['ProductPage']
type ProductPublisherFacet = components['schemas']['ProductPublisherFacet']
type ProductCategories = operations['listProductCategories']['responses'][200]['content']['application/json']
type CartResponse = components['schemas']['CartResponse']
type CouponPreviewRequest = components['schemas']['CouponPreviewRequest']
type CouponPreviewResponse = components['schemas']['CouponPreviewResponse']
type ErrorResponse = components['schemas']['ErrorResponse']
type OrderErrorResponse = components['schemas']['OrderErrorResponse']
type ProductDetail = components['schemas']['ProductDetail']
type CreateReviewRequest = components['schemas']['CreateReviewRequest']

const pendingReturnKey = 'bgg-shop.pending-return'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

function safeUiDestination(value: string): string | null {
  if (!value.startsWith('/') || value.startsWith('//')) return null
  try {
    const target = new URL(value, window.location.origin)
    const apiBasePath = new URL(apiBaseUrl, window.location.origin).pathname.replace(/\/+$/, '')
    if (target.origin !== window.location.origin
      || (apiBasePath && (target.pathname === apiBasePath || target.pathname.startsWith(`${apiBasePath}/`)))) {
      return null
    }
    return canonicalizeUiPath(`${target.pathname}${target.search}${target.hash}`)
  } catch {
    return null
  }
}

function slugify(value: string) {
  return value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function formatPrice(price: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price)
}

function ProductCard({ product, onOpen, onAdd, adding }: { product: Product; onOpen: (product: Product) => void; onAdd: (product: Product) => void; adding: boolean }) {
  const headingId = `product-${product.bgg_id}-name`
  return (
    <article className="product-card" aria-labelledby={headingId}>
      <div className="product-image">
        <img src={product.image_url} alt={`Portada de ${product.name}`} />
      </div>
      <div className="product-content">
        <div className="product-meta">
          <span>{product.category[0]}</span>
          <span aria-hidden="true">·</span>
          <span>{product.publisher}</span>
        </div>
        <h3 id={headingId}>{product.name}</h3>
        <p>{product.playing_time_minutes} minutos de juego · {product.release_year}</p>
        <div className="product-details">
          <span>{product.min_players}–{product.max_players} jugadores</span>
          <span>{product.min_age}+</span>
        </div>
        <p className="product-stock">{cartMessages.availableStock(product.quantity)}</p>
        <div className="product-footer">
          <strong>{formatPrice(product.price)}</strong>
          <button className="text-button" type="button" onClick={() => onOpen(product)} aria-label={`Ver detalles de ${product.name}`}>
            Ver detalles <span aria-hidden="true">→</span>
          </button>
        </div>
        <button className="primary-button add-to-cart" type="button" onClick={() => onAdd(product)} disabled={product.quantity === 0 || adding} aria-label={cartMessages.add(product.name)}>
          {product.quantity === 0 ? "Sin stock" : adding ? cartMessages.adding : cartMessages.add(product.name)}
        </button>
      </div>
    </article>
  )
}

function readAccessToken() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? '{}') as { access_token?: string }
    return session.access_token
  } catch {
    return undefined
  }
}


function cartRequestOptions(method: string, body?: unknown, signal?: AbortSignal): RequestInit {
  const headers = new Headers()
  if (body !== undefined) headers.set("Content-Type", "application/json")
  const accessToken = readAccessToken()
  if (accessToken) headers.set("Authorization", `Bearer ${accessToken}`)
  const options: RequestInit = { method, headers, credentials: "include" }
  if (body !== undefined) options.body = JSON.stringify(body)
  if (signal) options.signal = signal
  return options
}

function isCouponPreviewResponse(value: unknown): value is CouponPreviewResponse {
  if (typeof value !== 'object' || value === null
    || !('valid' in value) || typeof value.valid !== 'boolean'
    || !('coupon_code' in value) || typeof value.coupon_code !== 'string'
    || !('discount_amount' in value) || (value.discount_amount !== null && typeof value.discount_amount !== 'number')
    || !('new_total' in value) || (value.new_total !== null && typeof value.new_total !== 'number')) return false
  if (!('reason' in value) || value.reason === undefined || value.reason === null) return true
  return value.reason === 'INACTIVE'
    || value.reason === 'NOT_YET_VALID'
    || value.reason === 'EXPIRED'
    || value.reason === 'EXHAUSTED'
    || value.reason === 'DISCOUNT_LIMIT_EXCEEDED'
    || value.reason === 'EMPTY_CART'
}

function couponRejectionMessage(reason: CouponPreviewResponse['reason']): string {
  switch (reason) {
    case 'INACTIVE': return 'Este cupón no está activo.'
    case 'NOT_YET_VALID': return 'Este cupón todavía no está vigente.'
    case 'EXPIRED': return 'Este cupón venció.'
    case 'EXHAUSTED': return 'Este cupón ya no tiene usos disponibles.'
    case 'DISCOUNT_LIMIT_EXCEEDED': return 'El descuento supera el límite permitido para este carrito.'
    case 'EMPTY_CART': return 'Agregá productos al carrito antes de validar un cupón.'
    default: return 'Este cupón no se puede aplicar a tu carrito.'
  }
}

function CouponPreviewPanel({ authenticated, cartEmpty, onLogin }: {
  authenticated: boolean
  cartEmpty: boolean
  onLogin: () => void
}) {
  const [couponCode, setCouponCode] = useState('')
  const [preview, setPreview] = useState<CouponPreviewResponse | null>(null)
  const [state, setState] = useState<'idle' | 'loading' | 'success' | 'error'>('idle')
  const [error, setError] = useState<string | null>(null)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => () => controllerRef.current?.abort(), [])

  const submitPreview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!authenticated || cartEmpty || couponCode === '') return

    controllerRef.current?.abort()
    const controller = new AbortController()
    controllerRef.current = controller
    setState('loading')
    setPreview(null)
    setError(null)

    const request: CouponPreviewRequest = { coupon_code: couponCode }
    try {
      const response = await fetch(
        `${apiBaseUrl}/cart/coupons/preview`,
        cartRequestOptions('POST', request, controller.signal),
      )
      if (response.status === 401) throw new Error('Tu sesión expiró. Iniciá sesión para previsualizar el cupón.')
      if (response.status === 404) throw new Error('No encontramos un cupón con ese código exacto.')
      if (!response.ok) throw new Error('No se pudo previsualizar el cupón. Intentá nuevamente.')

      const payload: unknown = await response.json()
      if (!isCouponPreviewResponse(payload)) throw new Error('La respuesta de previsualización no es válida.')
      setPreview(payload)
      setState('success')
    } catch (reason: unknown) {
      if (controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : 'No se pudo previsualizar el cupón.')
      setState('error')
    }
  }

  return (
    <section className="cart-coupon-preview" aria-labelledby="coupon-preview-title">
      <h2 id="coupon-preview-title">Previsualizar cupón</h2>
      {cartEmpty ? (
        <p role="status">Agregá productos al carrito para previsualizar un cupón.</p>
      ) : !authenticated ? (
        <p role="status">
          Iniciá sesión para previsualizar un cupón en tu carrito.
          {' '}
          <button className="text-button" type="button" onClick={onLogin}>Iniciar sesión</button>
        </p>
      ) : (
        <>
          <form onSubmit={submitPreview}>
            <label htmlFor="cart-coupon-code">Código del cupón</label>
            <input
              id="cart-coupon-code"
              type="text"
              autoComplete="off"
              required
              value={couponCode}
              onChange={(event) => {
                controllerRef.current?.abort()
                setCouponCode(event.target.value)
                setPreview(null)
                setError(null)
                setState('idle')
              }}
            />
            <button className="primary-button" type="submit" disabled={state === 'loading' || couponCode === ''}>
              {state === 'loading' ? 'Validando…' : 'Previsualizar'}
            </button>
          </form>
          {state === 'loading' ? <p role="status">Consultando el cupón para tu carrito...</p> : null}
          {state === 'error' && error ? <p role="alert">{error}</p> : null}
          {state === 'success' && preview ? (
            <div role="status">
              <p>{preview.valid ? 'Cupón válido para este carrito.' : couponRejectionMessage(preview.reason)}</p>
              {preview.valid ? (
                <>
                  <p>Ahorro estimado: {preview.discount_amount === null ? 'No disponible' : formatPrice(preview.discount_amount)}</p>
                  <p>Total estimado: {preview.new_total === null ? 'No disponible' : formatPrice(preview.new_total)}</p>
                </>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  )
}

function ProductDetailScreen({ slug, onBack, onLogin }: { slug: string; onBack: () => void; onLogin: () => void }) {
  const [product, setProduct] = useState<ProductDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [rating, setRating] = useState('5')
  const [body, setBody] = useState('')
  const [submission, setSubmission] = useState<'idle' | 'submitting' | 'success'>('idle')
  const [submissionError, setSubmissionError] = useState<string | null>(null)
  const [toast, setToast] = useState<string | null>(null)
  const [wishlistState, setWishlistState] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle')
  const [wishlistMessage, setWishlistMessage] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/games/${encodeURIComponent(slug)}`, { signal: controller.signal })
      .then(async (response) => {
        if (response.status === 404) throw new Error('No encontramos ese juego.')
        if (!response.ok) throw new Error('No se pudo cargar el detalle del juego.')
        return response.json() as Promise<ProductDetail>
      })
      .then(setProduct)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'No se pudo cargar el detalle del juego.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [slug])

  const saveToWishlist = async () => {
    if (wishlistState === 'submitting' || wishlistState === 'success') return
    if (!readAccessToken()) {
      onLogin()
      return
    }
    const bggId = product?.bgg_id
    if (!Number.isInteger(bggId) || !bggId || bggId < 1) {
      setWishlistState('error')
      setWishlistMessage('No se pudo identificar este juego para guardarlo.')
      return
    }
    setWishlistState('submitting')
    setWishlistMessage(null)
    try {
      const request: components['schemas']['WishlistAddRequest'] = { bgg_id: bggId }
      const response = await fetch(`${apiBaseUrl}/wishlist`, cartRequestOptions('POST', request))
      if (response.status === 401) {
        onLogin()
        return
      }
      if (!response.ok) {
        const payload = await response.json().catch(() => undefined) as ErrorResponse | OrderErrorResponse | undefined
        const code = payload && 'errors' in payload ? payload.errors?.[0]?.code : undefined
        setWishlistMessage(code === 'PRODUCT_NOT_FOUND'
          ? 'No encontramos este juego.'
          : 'No se pudo guardar el juego en tu lista de deseos. Intentá nuevamente.')
        setWishlistState('error')
        return
      }
      setWishlistState('success')
      setWishlistMessage(`${product?.name ?? 'El juego'} se agregó a tu lista de deseos.`)
    } catch {
      setWishlistState('error')
      setWishlistMessage('No se pudo conectar con el servicio. Intentá nuevamente.')
    }
  }

  const submitReview = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const accessToken = readAccessToken()
    if (!accessToken) {
      setSubmissionError('Iniciá sesión para dejar una reseña.')
      return
    }
    const request: CreateReviewRequest = { rating: Number(rating), body: body.trim() }
    if (!request.body || request.body.length > 2000) {
      setSubmissionError('La reseña debe tener entre 1 y 2000 caracteres.')
      return
    }
    setSubmission('submitting')
    setSubmissionError(null)
    try {
      const response = await fetch(`${apiBaseUrl}/games/${encodeURIComponent(slug)}/reviews`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${accessToken}` },
        body: JSON.stringify(request),
      })
      const payload = await response.json() as { errors?: Array<{ code?: string; message?: string }> }
      if (!response.ok) {
        setSubmissionError(reviewErrorMessage(payload.errors?.[0]?.code))
        setSubmission('idle')
        return
      }
      setSubmission('success')
      setBody('')
      setToast('Tu reseña fue enviada y quedó pendiente de moderación.')
      window.setTimeout(() => setToast(null), 5000)
    } catch {
      setSubmissionError('No se pudo conectar con el servicio de reseñas.')
      setSubmission('idle')
    }
  }

  if (loading) return <main className="detail-page"><div className="empty-state" role="status">Cargando detalle...</div></main>
  if (error || !product) return <main className="detail-page"><div className="empty-state" role="alert"><h1>No se pudo cargar el juego</h1><p>{error ?? 'Juego no encontrado.'}</p><button className="primary-button" type="button" onClick={onBack}>Volver al catálogo</button></div></main>

  return (
    <main className="detail-page">
      {toast && <div className="toast" role="status">{toast}<button type="button" onClick={() => setToast(null)} aria-label="Cerrar mensaje">×</button></div>}
      <button className="text-button" type="button" onClick={onBack}>← Volver al catálogo</button>
      <article className="detail-card">
        <img src={product.image_url} alt={`Portada de ${product.name}`} />
        <div>
          <p className="eyebrow">Detalle del juego</p>
          <h1>{product.name}</h1>
          <p>{product.publisher} · {product.release_year}</p>
          <p>{product.min_players}–{product.max_players} jugadores · {product.playing_time_minutes} minutos · {product.min_age}+</p>
          <p>{cartMessages.availableStock(product.quantity)}</p>
          <strong>{formatPrice(product.price)}</strong>
          <div className="wishlist-save-action">
            <button className="primary-button" type="button" onClick={() => void saveToWishlist()} disabled={wishlistState === 'submitting' || wishlistState === 'success'}>
              {wishlistState === 'submitting' ? 'Guardando...' : wishlistState === 'success' ? 'Guardado en mi lista de deseos' : 'Guardar en mi lista de deseos'}
            </button>
            {wishlistMessage && <p role={wishlistState === 'error' ? 'alert' : 'status'}>{wishlistMessage}</p>}
          </div>
          <section aria-labelledby="reviews-title">
            <h2 id="reviews-title">Reseñas de la comunidad</h2>
            <p>{product.review_summary.approved_review_count} reseñas · {product.review_summary.average_rating?.toFixed(1) ?? 'Sin calificaciones'}</p>
            {product.approved_reviews.length === 0 ? <p role="status">Todavía no hay reseñas aprobadas.</p> : (
              <div>{product.approved_reviews.map((review) => <blockquote key={`${review.created_at}-${review.body}`}><p>“{review.body}”</p><footer>{review.rating}/5 · {new Date(review.created_at).toLocaleDateString('es-AR')}</footer></blockquote>)}</div>
            )}
          </section>
        </div>
      </article>
      <section className="review-form-section" aria-labelledby="review-form-title">
        <h2 id="review-form-title">Dejá tu reseña</h2>
        {submission === 'success' ? <p role="status">Tu reseña fue enviada y quedó pendiente de moderación.</p> : (
          <form onSubmit={submitReview}>
            <label htmlFor="review-rating">Calificación
              <select id="review-rating" value={rating} onChange={(event) => setRating(event.target.value)}>
                {[5, 4, 3, 2, 1].map((value) => <option key={value} value={value}>{value}/5</option>)}
              </select>
            </label>
            <label htmlFor="review-body">Reseña
              <textarea id="review-body" value={body} maxLength={2000} onChange={(event) => setBody(event.target.value)} required />
            </label>
            {submissionError && <p role="alert">{submissionError}</p>}
            <button className="primary-button" type="submit" disabled={submission === 'submitting'}>{submission === 'submitting' ? 'Enviando...' : 'Enviar reseña'}</button>
          </form>
        )}
      </section>
    </main>
  )
}


function CartScreen({ onBack, onNavigate }: { onBack: () => void; onNavigate: (path: string) => void }) {
  const [cart, setCart] = useState<CartResponse | null>(null)
  const [loadState, setLoadState] = useState<"loading" | "error" | "success">("loading")
  const [loadError, setLoadError] = useState<string | null>(null)
  const [operationError, setOperationError] = useState<string | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [quantityDrafts, setQuantityDrafts] = useState<Record<number, string>>({})
  const [retry, setRetry] = useState(0)
  const [showLoginPrompt, setShowLoginPrompt] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/cart`, cartRequestOptions("GET", undefined, controller.signal))
      .then(async (response) => {
        if (!response.ok) throw new Error(cartErrorMessage())
        return response.json() as Promise<CartResponse>
      })
      .then((data) => {
        setCart(data)
        setLoadState("success")
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(reason instanceof Error ? reason.message : cartErrorMessage())
        setLoadState("error")
      })
    return () => controller.abort()
  }, [retry])

  const changeCart = async (bggId: number, method: "PATCH" | "DELETE", body?: unknown) => {
    if (pendingId !== null) return
    setPendingId(bggId)
    setOperationError(null)
    try {
      const response = await fetch(`${apiBaseUrl}/cart/items/${bggId}`, cartRequestOptions(method, body))
      const payload = await response.json() as CartResponse | ErrorResponse
      if ("lines" in payload) {
        setCart(payload)
        setQuantityDrafts({})
        if (!response.ok && payload.warnings.length === 0) setOperationError(cartErrorMessage())
      } else {
        setOperationError(cartErrorMessage())
      }
    } catch {
      setOperationError(cartErrorMessage())
    } finally {
      setPendingId(null)
    }
  }

  const submitQuantity = (event: FormEvent<HTMLFormElement>, bggId: number) => {
    event.preventDefault()
    const quantity = Number(quantityDrafts[bggId])
    if (!Number.isInteger(quantity) || quantity < 1) {
      setOperationError(cartMessages.updateError)
      return
    }
    void changeCart(bggId, "PATCH", { quantity })
  }

  return (
    <main className="cart-page" aria-labelledby="cart-title">
      <button className="text-button" type="button" onClick={onBack}>← {cartMessages.continueShopping}</button>
      <h1 id="cart-title">Tu carrito</h1>
      {loadState === "loading" ? (
        <div className="empty-state" role="status">{cartMessages.loading}</div>
      ) : loadState === "error" ? (
        <div className="empty-state" role="alert">
          <h2>{cartMessages.loadErrorTitle}</h2>
          <p>{loadError}</p>
          <button className="primary-button" type="button" onClick={() => { setLoadState("loading"); setLoadError(null); setRetry((value) => value + 1) }}>{cartMessages.retry}</button>
        </div>
      ) : cart ? (
        <>
          {operationError && <p role="alert">{operationError}</p>}
          {cart.warnings.map((warning, index) => <p className="cart-warning" role="status" key={`${warning.code}-${index}`}>{warning.message}</p>)}
          {cart.lines.length === 0 ? (
            <p className="empty-state" role="status">{cartMessages.empty}</p>
          ) : (
            <ul className="cart-lines" aria-label="Juegos en el carrito">
              {cart.lines.map((line) => (
                <li className="cart-line" key={line.bgg_id} aria-label={line.name}>
                  <div className="cart-line-info">
                    <h2>{line.name}</h2>
                    <p>{formatPrice(line.unit_price)} por unidad · {line.available_stock} disponibles</p>
                    <strong>Subtotal: {formatPrice(line.subtotal)}</strong>
                  </div>
                  <form className="cart-quantity-form" onSubmit={(event) => submitQuantity(event, line.bgg_id)}>
                    <label htmlFor={`cart-quantity-${line.bgg_id}`}>{cartMessages.quantity(line.name)}</label>
                    <input
                      id={`cart-quantity-${line.bgg_id}`}
                      type="number"
                      min="1"
                      max={line.available_stock}
                      required
                      value={quantityDrafts[line.bgg_id] ?? String(line.quantity)}
                      onChange={(event) => setQuantityDrafts((current) => ({ ...current, [line.bgg_id]: event.target.value }))}
                    />
                    <button className="text-button" type="submit" disabled={pendingId !== null || line.available_stock === 0} aria-label={cartMessages.updateQuantity(line.name)}>
                      {pendingId === line.bgg_id ? cartMessages.updating : "Actualizar cantidad"}
                    </button>
                  </form>
                  <button className="text-button remove-cart-item" type="button" onClick={() => void changeCart(line.bgg_id, "DELETE")} disabled={pendingId !== null} aria-label={cartMessages.remove(line.name)}>
                    {pendingId === line.bgg_id ? cartMessages.removing : "Quitar"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <section className="cart-total" aria-label={cartMessages.total}>
            <h2>{cartMessages.total}</h2>
            <strong>{formatPrice(cart.total)}</strong>
          </section>
          <CouponPreviewPanel
            key={`${cart.total}:${cart.lines.map((line) => `${line.bgg_id}-${line.quantity}`).join(',')}`}
            authenticated={Boolean(readAccessToken())}
            cartEmpty={cart.lines.length === 0}
            onLogin={() => {
              sessionStorage.setItem(pendingReturnKey, '/carrito')
              onNavigate(uiRoutes.login)
            }}
          />
          {showLoginPrompt && <p role="status">Iniciá sesión para continuar con tu compra. <a href={uiRoutes.login} onClick={(event) => { event.preventDefault(); sessionStorage.setItem(pendingReturnKey, uiRoutes.checkout); onNavigate(uiRoutes.login) }}>Iniciar sesión</a></p>}
          <button className="primary-button" type="button" disabled={cart.lines.length === 0 || pendingId !== null} onClick={() => {
            if (!readAccessToken()) setShowLoginPrompt(true)
            else onNavigate(uiRoutes.checkout)
          }}>Proceder al Pago</button>
        </>
      ) : null}
    </main>
  )
}

function CatalogApp({
  onNavigate,
  canAccessAdmin,
  isCatalogPage,
  capabilityError,
  onRetryCapabilities,
}: {
  onNavigate: (path: string) => void
  canAccessAdmin: boolean
  isCatalogPage: boolean
  capabilityError: boolean
  onRetryCapabilities: () => void
}) {
  const initialUrlState = readCatalogUrlState()
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => Boolean(sessionStorage.getItem(SESSION_STORAGE_KEY)),
  )
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [searchDraft, setSearchDraft] = useState(initialUrlState.search)
  const [search, setSearch] = useState(initialUrlState.search)
  const [year, setYear] = useState(initialUrlState.year)
  const [categoryName, setCategoryName] = useState(initialUrlState.categoryName)
  const [publisher, setPublisher] = useState(initialUrlState.publisher)
  const [categories, setCategories] = useState<ProductCategories>([])
  const [categoriesLoading, setCategoriesLoading] = useState(true)
  const [categoriesError, setCategoriesError] = useState(false)
  const [categoriesRetry, setCategoriesRetry] = useState(0)
  const [publishers, setPublishers] = useState<ProductPublisherFacet[]>([])
  const [publishersLoading, setPublishersLoading] = useState(true)
  const [publishersError, setPublishersError] = useState(false)
  const [publishersRetry, setPublishersRetry] = useState(0)
  const [invalidUrlFilterNotice, setInvalidUrlFilterNotice] = useState<string | null>(null)
  const [minPlayers, setMinPlayers] = useState(initialUrlState.minPlayers)
  const [maxPlayers, setMaxPlayers] = useState(initialUrlState.maxPlayers)
  const [minPrice, setMinPrice] = useState(initialUrlState.minPrice)
  const [maxPrice, setMaxPrice] = useState(initialUrlState.maxPrice)
  const [sort, setSort] = useState<SortOrder>(initialUrlState.sort)
  const [page, setPage] = useState(initialUrlState.page)
  const [total, setTotal] = useState(0)
  const [totalPages, setTotalPages] = useState(0)
  const [addingProductId, setAddingProductId] = useState<number | null>(null)
  const [cartFeedback, setCartFeedback] = useState<string | null>(null)
  const [cartFeedbackError, setCartFeedbackError] = useState(false)
  const [logoutPending, setLogoutPending] = useState(false)
  const [logoutError, setLogoutError] = useState<string | null>(null)
  const invalidPlayerRange = minPlayers !== '' && maxPlayers !== '' && Number(minPlayers) > Number(maxPlayers)
  const invalidPriceRange = minPrice !== '' && maxPrice !== '' && Number(minPrice) > Number(maxPrice)
  const invalidRange = isCatalogPage && (invalidPlayerRange || invalidPriceRange)

  const currentCatalogState = (): CatalogUrlState => ({
    search,
    categoryName,
    publisher,
    year,
    minPlayers,
    maxPlayers,
    minPrice,
    maxPrice,
    page,
    sort,
  })

  const applyCatalogState = (
    next: CatalogUrlState,
    historyMode: 'push' | 'replace' | 'none' = 'push',
  ) => {
    setSearchDraft(next.search)
    setSearch(next.search)
    setCategoryName(next.categoryName)
    setPublisher(next.publisher)
    setYear(next.year)
    setMinPlayers(next.minPlayers)
    setMaxPlayers(next.maxPlayers)
    setMinPrice(next.minPrice)
    setMaxPrice(next.maxPrice)
    setPage(next.page)
    setSort(next.sort)
    setInvalidUrlFilterNotice(null)
    if (isCatalogPage && historyMode !== 'none') {
      const path = catalogUrl(next, window.location.hash)
      if (historyMode === 'push') window.history.pushState({}, '', path)
      else window.history.replaceState(window.history.state, '', path)
    }
  }

  useEffect(() => {
    const handleCatalogHistory = () => {
      applyCatalogState(readCatalogUrlState(), isCatalogPage ? 'replace' : 'none')
    }
    window.addEventListener('popstate', handleCatalogHistory)
    return () => window.removeEventListener('popstate', handleCatalogHistory)
  }, [isCatalogPage])

  useEffect(() => {
    if (!isCatalogPage) return
    const normalized = catalogUrl(readCatalogUrlState(), window.location.hash)
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`
    if (current !== normalized) window.history.replaceState(window.history.state, '', normalized)
  }, [isCatalogPage])

  useEffect(() => {
    if (invalidRange) {
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const params = new URLSearchParams({
      page: String(isCatalogPage ? page : 1),
      page_size: isCatalogPage ? '100' : '8',
    })
    if (isCatalogPage && search.trim()) params.set('search', search.trim())
    if (isCatalogPage && year) params.set('year_published', year)
    if (isCatalogPage && categoryName) params.set('category_name', categoryName)
    if (isCatalogPage && publisher) params.set('publisher', publisher)
    if (isCatalogPage && minPlayers) params.set('min_players', minPlayers)
    if (isCatalogPage && maxPlayers) params.set('max_players', maxPlayers)
    if (isCatalogPage && minPrice) params.set('price_min', minPrice)
    if (isCatalogPage && maxPrice) params.set('price_max', maxPrice)

    setLoading(true)
    setError(null)
    fetch(`${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'}/products?${params}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar el catálogo.')
        return response.json() as Promise<ProductPage>
      })
      .then((result) => {
        if (page > Math.max(1, result.total_pages)) {
          applyCatalogState(
            { ...currentCatalogState(), page: Math.max(1, result.total_pages) },
            'replace',
          )
          return
        }
        setProducts(result.items)
        setTotal(result.total)
        setTotalPages(result.total_pages)
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'No se pudo cargar el catálogo.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [isCatalogPage, search, year, categoryName, publisher, minPlayers, maxPlayers, minPrice, maxPrice, page, invalidRange, retry])

  useEffect(() => {
    const controller = new AbortController()
    setCategoriesLoading(true)
    setCategoriesError(false)
    fetch(`${apiBaseUrl}/product-categories`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load categories')
        const value: unknown = await response.json()
        if (!Array.isArray(value) || !value.every((item) => typeof item === 'string' && item.trim())) {
          throw new Error('Invalid categories response')
        }
        return value as ProductCategories
      })
      .then((value) => {
        setCategories(value)
        const selected = readCatalogUrlState().categoryName
        if (isCatalogPage && selected && !value.includes(selected)) {
          applyCatalogState({ ...readCatalogUrlState(), categoryName: '', page: 1 }, 'replace')
          setInvalidUrlFilterNotice('La categoría del enlace no está disponible. Se muestran todas las categorías.')
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setCategoriesError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setCategoriesLoading(false)
      })
    return () => controller.abort()
  }, [categoriesRetry])

  useEffect(() => {
    const controller = new AbortController()
    setPublishersLoading(true)
    setPublishersError(false)
    fetch(`${apiBaseUrl}/product-publishers`, { signal: controller.signal })
      .then(async (response) => {
        if (!response.ok) throw new Error('Failed to load publishers')
        const value: unknown = await response.json()
        if (!Array.isArray(value)) throw new Error('Invalid publishers response')
        const seen = new Set<string>()
        const valid = value.every((item: unknown) => {
          if (typeof item !== 'object' || item === null || Array.isArray(item)) return false
          const facet = item as Record<string, unknown>
          if (
            typeof facet.publisher !== 'string'
            || !facet.publisher
            || facet.publisher !== facet.publisher.trim()
            || facet.publisher.length > 250
            || typeof facet.product_count !== 'number'
            || !Number.isInteger(facet.product_count)
            || facet.product_count < 0
            || seen.has(facet.publisher)
          ) return false
          seen.add(facet.publisher)
          return true
        })
        if (!valid) throw new Error('Invalid publishers response')
        return value as ProductPublisherFacet[]
      })
      .then((value) => {
        setPublishers(value)
        const selected = readCatalogUrlState().publisher
        if (
          isCatalogPage
          && selected
          && !value.some((facet) => facet.publisher === selected)
        ) {
          applyCatalogState({ ...readCatalogUrlState(), publisher: '', page: 1 }, 'replace')
          setInvalidUrlFilterNotice('La editorial del enlace no está disponible. Se muestran todos los juegos.')
        }
      })
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setPublishersError(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setPublishersLoading(false)
      })
    return () => controller.abort()
  }, [publishersRetry])

  const clearFilters = () => {
    applyCatalogState(emptyCatalogUrlState)
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const next = { ...currentCatalogState(), search: searchDraft.trim(), page: 1 }
    if (isCatalogPage) applyCatalogState(next)
    else onNavigate(catalogUrl(next))
  }

  useEffect(() => {
    const handleSessionChange = () => {
      setIsAuthenticated(Boolean(sessionStorage.getItem(SESSION_STORAGE_KEY)))
    }
    window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange)
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange)
  }, [])

  const handleLogout = async () => {
    let opKey: string | undefined
    try {
      const session = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? '{}') as { op_key?: string }
      opKey = session.op_key
    } catch {
      opKey = undefined
    }
    setLogoutPending(true)
    setLogoutError(null)
    try {
      const headers: Record<string, string> = opKey ? { 'X-Op-Key': opKey } : {}
      const response = await fetch(`${apiBaseUrl}/auth/logout`, {
        method: 'POST', headers, credentials: 'include',
      })
      if (!response.ok) throw new Error('Logout failed')
    } catch {
      setLogoutError('No se pudo cerrar sesión. Intentá nuevamente.')
      setLogoutPending(false)
      return
    }
    setLogoutPending(false)
    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
  }


  const addProductToCart = async (product: Product) => {
    if (addingProductId !== null || product.quantity === 0) return
    setAddingProductId(product.bgg_id)
    setCartFeedback(null)
    setCartFeedbackError(false)
    try {
      const response = await fetch(`${apiBaseUrl}/cart/items`, cartRequestOptions("POST", { bgg_id: product.bgg_id, quantity: 1 }))
      const payload = await response.json() as CartResponse | ErrorResponse
      if (!response.ok) {
        if ("warnings" in payload && payload.warnings.length > 0) {
          setCartFeedback(payload.warnings.map((warning) => warning.message).join(" "))
          return
        }
        setCartFeedbackError(true)
        setCartFeedback(cartMessages.addError)
        return
      }
      const cart = payload as CartResponse
      setCartFeedback(cart.warnings.length > 0
        ? cart.warnings.map((warning) => warning.message).join(" ")
        : cartMessages.addSuccess(product.name))
    } catch {
      setCartFeedbackError(true)
      setCartFeedback(cartMessages.addError)
    } finally {
      setAddingProductId(null)
    }
  }

  const visibleProducts = [...products]
    .sort((first, second) => {
      if (sort === 'price-low') return first.price - second.price
      if (sort === 'price-high') return second.price - first.price
      return 0
    })

  const updateCatalogState = (changes: Partial<CatalogUrlState>) => {
    const next = { ...currentCatalogState(), ...changes }
    if (!Object.hasOwn(changes, 'page')) next.page = 1
    applyCatalogState(next)
  }

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Meeple, inicio">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>Meeple</span>
        </a>
        <nav className="main-nav" aria-label="Navegación principal">
          <a className="active" href="/catalogo" onClick={(event) => { event.preventDefault(); onNavigate('/catalogo') }}>Catálogo</a>
          <a href="/catalogo#categorias" onClick={(event) => { event.preventDefault(); onNavigate('/catalogo#categorias') }}>Categorías</a>
          <a href="/catalogo#editorial" onClick={(event) => { event.preventDefault(); onNavigate('/catalogo#editorial') }}>Editoriales</a>
          <a href="/carrito" onClick={(event) => { event.preventDefault(); onNavigate("/carrito") }}>{cartMessages.openCart}</a>
          {isAuthenticated && <a href={uiRoutes.wishlist} onClick={(event) => { event.preventDefault(); onNavigate(uiRoutes.wishlist) }}>Lista de deseos</a>}
          {isAuthenticated && <a href="/mis-compras" onClick={(event) => { event.preventDefault(); onNavigate("/mis-compras") }}>Mis Compras</a>}
          {canAccessAdmin && <a href="/admin" onClick={(event) => { event.preventDefault(); onNavigate('/admin') }}>Administración</a>}
        </nav>
        <div className="account-actions">
          {isAuthenticated ? (
            <button className="logout-button" type="button" onClick={() => void handleLogout()} disabled={logoutPending}>Cerrar sesión</button>
          ) : (
            <>
              <a className="login-button" href={uiRoutes.login}>Iniciar sesión</a>
              <a className="main-nav-account" href={uiRoutes.register}>Crear cuenta</a>
            </>
          )}
        </div>
      </header>
      {logoutError && <p role="alert">{logoutError}</p>}
      {isAuthenticated && capabilityError && (
        <p role="alert" className="account-capability-error">
          No pudimos verificar tus permisos para administración. Revisá tu conexión e intentá nuevamente.
          <button type="button" onClick={onRetryCapabilities}>Reintentar</button>
        </p>
      )}

      <main>
        {!isCatalogPage && <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">Tu próxima partida empieza aquí</p>
            <h1 id="hero-title">Juegos que reúnen<br /><em>grandes historias.</em></h1>
            <p className="hero-lede">Descubre juegos de mesa para compartir, competir y crear recuerdos alrededor de la mesa.</p>
            <form className="top-search" onSubmit={submitSearch} role="search">
              <label htmlFor="catalog-search">Buscar por nombre o editorial</label>
              <div className="top-search-controls">
                <input
                  id="catalog-search"
                  type="search"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Ej. Devir o Watergate"
                />
                <button type="submit" className="primary-button">Buscar</button>
              </div>
            </form>
            <a className="primary-button" href="/catalogo" onClick={(event) => { event.preventDefault(); onNavigate('/catalogo') }}>Explorar catálogo <span aria-hidden="true">↗</span></a>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="sun"></div>
            <div className="hero-card hero-card-back"></div>
            <div className="hero-card hero-card-front"><span className="art-label">Juguemos<br />juntos</span><span className="art-symbol">✦</span></div>
            <span className="art-spark spark-one">✦</span><span className="art-spark spark-two">·</span>
          </div>
        </section>}

        <section className="catalog-section" id="catalogo" aria-labelledby="catalog-title">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{isCatalogPage ? 'Descubrí todo el catálogo' : 'Selección de la casa'}</p>
              <h1 id="catalog-title">{isCatalogPage ? 'Catálogo completo' : 'Juegos para disfrutar'}</h1>
            </div>
            {!isCatalogPage && <a className="view-all" href="/catalogo" onClick={(event) => { event.preventDefault(); onNavigate('/catalogo') }}>Ver todo <span aria-hidden="true">→</span></a>}
          </div>
          {!isCatalogPage && <nav className="discovery-links" aria-label="Explorar el catálogo">
            <a id="categorias" href="/catalogo#categorias" onClick={(event) => { event.preventDefault(); onNavigate('/catalogo#categorias') }}>Categorías</a>
            <a id="editorial" href="/catalogo#editorial" onClick={(event) => { event.preventDefault(); onNavigate('/catalogo#editorial') }}>Editoriales</a>
          </nav>}
          {isCatalogPage && <div className="filter-panel" aria-label="Filtros del catálogo">
            <form className="catalog-search" onSubmit={submitSearch} role="search">
              <label htmlFor="catalog-search">Buscar por nombre o editorial</label>
              <div className="top-search-controls">
                <input
                  id="catalog-search"
                  type="search"
                  value={searchDraft}
                  onChange={(event) => setSearchDraft(event.target.value)}
                  placeholder="Ej. Devir o Watergate"
                />
                <button type="submit" className="primary-button">Buscar</button>
              </div>
            </form>
            <div className="filter-row">
              <label>Año de publicación
                <input type="number" min="0" value={year} onChange={(event) => updateCatalogState({ year: event.target.value })} />
              </label>
              <label id="categorias">Categoría
                <select value={categoryName} onChange={(event) => updateCatalogState({ categoryName: event.target.value })} disabled={categoriesLoading || categoriesError}>
                  <option value="">Todas las categorías</option>
                  {categoryName && !categories.includes(categoryName) && <option value={categoryName}>{categoryName}</option>}
                  {categories.map((category) => <option value={category} key={category}>{category}</option>)}
                </select>
              </label>
              <label id="editorial">Editorial
                <select
                  value={publisher}
                  onChange={(event) => updateCatalogState({ publisher: event.target.value })}
                  disabled={publishersLoading || publishersError}
                >
                  <option value="">Todas las editoriales</option>
                  {publisher && !publishers.some((facet) => facet.publisher === publisher)
                    && <option value={publisher}>{publisher} (No disponible)</option>}
                  {publishers.map((facet) => (
                    <option value={facet.publisher} key={facet.publisher}>
                      {facet.publisher} ({facet.product_count} {facet.product_count === 1 ? 'juego' : 'juegos'})
                    </option>
                  ))}
                </select>
              </label>
              <label>Mínimo de jugadores
                <input type="number" min="1" value={minPlayers} aria-invalid={invalidPlayerRange} aria-describedby={invalidPlayerRange ? 'player-range-error' : undefined} onChange={(event) => updateCatalogState({ minPlayers: event.target.value })} />
              </label>
              <label>Máximo de jugadores
                <input type="number" min="1" value={maxPlayers} aria-invalid={invalidPlayerRange} aria-describedby={invalidPlayerRange ? 'player-range-error' : undefined} onChange={(event) => updateCatalogState({ maxPlayers: event.target.value })} />
              </label>
              <label>Precio mínimo
                <input type="number" min="0" value={minPrice} aria-invalid={invalidPriceRange} aria-describedby={invalidPriceRange ? 'price-range-error' : undefined} onChange={(event) => updateCatalogState({ minPrice: event.target.value })} />
              </label>
              <label>Precio máximo
                <input type="number" min="0" value={maxPrice} aria-invalid={invalidPriceRange} aria-describedby={invalidPriceRange ? 'price-range-error' : undefined} onChange={(event) => updateCatalogState({ maxPrice: event.target.value })} />
              </label>
            </div>
            {invalidRange && <div role="alert">
              {invalidPlayerRange && <p id="player-range-error">El mínimo de jugadores no puede superar el máximo.</p>}
              {invalidPriceRange && <p id="price-range-error">El precio mínimo no puede superar el máximo.</p>}
            </div>}
            {categoriesError && <p role="alert">No se pudieron cargar las categorías. <button type="button" onClick={() => setCategoriesRetry((value) => value + 1)}>Reintentar categorías</button></p>}
            {publishersLoading && <p role="status">Cargando editoriales...</p>}
            {publishersError && <p role="alert">No se pudieron cargar las editoriales. <button type="button" onClick={() => setPublishersRetry((value) => value + 1)}>Reintentar editoriales</button></p>}
            {invalidUrlFilterNotice && <p role="status">{invalidUrlFilterNotice}</p>}
            <div className="catalog-toolbar">
              <label className="sort-control">Ordenar página por
                <select value={sort} onChange={(event) => updateCatalogState({ sort: event.target.value as SortOrder })} aria-label="Ordenar productos">
                  <option value="default">Orden del catálogo</option>
                  <option value="price-low">Precio menor</option>
                  <option value="price-high">Precio mayor</option>
                </select>
              </label>
            </div>
            {!loading && !error && !invalidRange && <div className="results-summary" aria-live="polite">{total} resultados</div>}
            <button type="button" className="clear-filters" onClick={clearFilters}>Limpiar filtros</button>
          </div>}
          {cartFeedback && <p role={cartFeedbackError ? "alert" : "status"} aria-live={cartFeedbackError ? "assertive" : "polite"}>{cartFeedback}</p>}
          {invalidRange ? null : loading ? (
            <div className="empty-state" role="status">Cargando catálogo...</div>
          ) : error ? (
            <div className="empty-state" role="alert">
              <h3>No se pudo cargar el catálogo</h3>
              <p>{error}</p>
              <button type="button" className="primary-button" onClick={() => setRetry((value) => value + 1)}>Reintentar</button>
            </div>
          ) : visibleProducts.length === 0 ? (
            <div className="empty-state" role="status">
              <h3>No encontramos juegos</h3>
              <p>Probá con otros criterios o limpiá los filtros.</p>
              <button type="button" className="primary-button" onClick={clearFilters}>Limpiar filtros</button>
            </div>
          ) : (
            <div className="product-grid">{visibleProducts.map((product) => <ProductCard product={product} key={product.bgg_id} onOpen={(selected) => { window.history.pushState({}, '', `/juegos/${slugify(selected.name)}?bgg_id=${selected.bgg_id}`); window.dispatchEvent(new PopStateEvent('popstate')) }} onAdd={addProductToCart} adding={addingProductId === product.bgg_id} />)}</div>
          )}
          {isCatalogPage && !invalidRange && !error && totalPages > 1 && (
            <nav className="catalog-pagination" aria-label="Páginas del catálogo">
              <button type="button" aria-label="Página anterior" disabled={loading || page <= 1} onClick={() => updateCatalogState({ page: page - 1 })}>Anterior</button>
              <span aria-live="polite">Página {page} de {totalPages}</span>
              <button type="button" aria-label="Página siguiente" disabled={loading || page >= totalPages} onClick={() => updateCatalogState({ page: page + 1 })}>Siguiente</button>
            </nav>
          )}
        </section>

        {!isCatalogPage && <section className="editorial-banner" id="home-editorial" aria-label="Manifiesto de Meeple">
          <p className="eyebrow">Más que una tienda</p>
          <h2>El mundo es mejor<br /><em>cuando jugamos juntos.</em></h2>
          <p>Elegimos cada título pensando en esos momentos que se quedan contigo mucho después de guardar la caja.</p>
        </section>}
      </main>

      <footer className="site-footer">
        <a className="brand" href="/" aria-label="Meeple, inicio"><span className="brand-mark" aria-hidden="true">M</span><span>Meeple</span></a>
        <p>Juegos con intención, partidas con alma.</p>
        <small>© 2024 Meeple</small>
      </footer>
      <Chatbot />
    </div>
  )
}

function App() {
  const [pathname, setPathname] = useState(() => {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`
    const canonicalPath = canonicalizeUiPath(currentPath)
    if (canonicalPath !== currentPath) {
      window.history.replaceState(window.history.state, '', canonicalPath)
    }
    return new URL(canonicalPath, window.location.origin).pathname
  })
  const [capabilityState, setCapabilityState] = useState<
    { status: 'idle' } |
    { status: 'loading' } |
    { status: 'ready'; capabilities: AdminCapabilities } |
    { status: 'error' }
  >({ status: 'idle' })
  const [sessionRevision, setSessionRevision] = useState(0)
  const [capabilityRetry, setCapabilityRetry] = useState(0)
  const capabilityRequestId = useRef(0)
  const refreshAttemptedToken = useRef<string | null>(null)
  const accessToken = readAccessToken()
  const adminRouteKey = pathname === '/admin' || pathname.startsWith('/admin/') ? pathname : null
  const capabilityRouteKey = adminRouteKey ?? (
    pathname === '/' || pathname === '/catalogo' ? 'storefront' : null
  )

  useEffect(() => {
    const handlePopState = () => {
      let nextUrl = `${window.location.pathname}${window.location.search}${window.location.hash}`
      const canonicalUrl = canonicalizeUiPath(nextUrl)
      if (canonicalUrl !== nextUrl) {
        window.history.replaceState(window.history.state, '', canonicalUrl)
        nextUrl = canonicalUrl
      }
      let nextPath = new URL(nextUrl, window.location.origin).pathname
      if (nextPath === '/' && readAccessToken()) {
        const destination = sessionStorage.getItem(pendingReturnKey)
        if (destination) {
          sessionStorage.removeItem(pendingReturnKey)
          const safeDestination = safeUiDestination(destination)
          if (safeDestination) {
            window.history.pushState({}, '', safeDestination)
            nextPath = new URL(safeDestination, window.location.origin).pathname
          }
        }
      }
      setPathname(nextPath)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  useEffect(() => {
    const invalidate = () => {
      setCapabilityState({ status: 'idle' })
      setSessionRevision((revision) => revision + 1)
    }
    window.addEventListener(SESSION_CHANGE_EVENT, invalidate)
    window.addEventListener(ADMIN_AUTHORIZATION_DENIED_EVENT, invalidate)
    return () => {
      window.removeEventListener(SESSION_CHANGE_EVENT, invalidate)
      window.removeEventListener(ADMIN_AUTHORIZATION_DENIED_EVENT, invalidate)
    }
  }, [])

  useEffect(() => {
    const requestId = ++capabilityRequestId.current
    if (!accessToken || !capabilityRouteKey) {
      setCapabilityState({ status: 'idle' })
      return () => {
        if (capabilityRequestId.current === requestId) capabilityRequestId.current += 1
      }
    }

    const controller = new AbortController()
    setCapabilityState({ status: 'loading' })
    void fetchAdminCapabilities(controller.signal)
      .then((capabilities) => {
        if (controller.signal.aborted || capabilityRequestId.current !== requestId
          || readAccessToken() !== accessToken) return
        setCapabilityState({ status: 'ready', capabilities })
      })
      .catch(async (reason: unknown) => {
        if (controller.signal.aborted || capabilityRequestId.current !== requestId
          || readAccessToken() !== accessToken) return
        if (reason instanceof AdminCapabilitiesError && reason.status === 401) {
          if (refreshAttemptedToken.current === accessToken) {
            sessionStorage.removeItem(SESSION_STORAGE_KEY)
            window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
            return
          }
          refreshAttemptedToken.current = accessToken
          const refreshResult = await refreshSession()
          if (refreshResult !== 'unavailable') {
            if (refreshResult === 'refreshed') {
              refreshAttemptedToken.current = readAccessToken() ?? accessToken
            }
            return
          }
          if (controller.signal.aborted || capabilityRequestId.current !== requestId
            || readAccessToken() !== accessToken) return
          refreshAttemptedToken.current = null
        }
        setCapabilityState({ status: 'error' })
      })
    return () => {
      controller.abort()
      if (capabilityRequestId.current === requestId) capabilityRequestId.current += 1
    }
  }, [accessToken, sessionRevision, capabilityRouteKey, capabilityRetry])

  const navigate = useCallback((path: string) => {
    const target = new URL(path, window.location.origin)
    if (target.origin !== window.location.origin) return
    const canonicalUrl = canonicalizeUiPath(`${target.pathname}${target.search}${target.hash}`)
    const canonicalTarget = new URL(canonicalUrl, window.location.origin)
    window.history.pushState({}, '', canonicalUrl)
    setPathname(canonicalTarget.pathname)
  }, [])

  const navigateToLoginAndReturn = useCallback((destination: string) => {
    const safeDestination = safeUiDestination(destination)
    if (safeDestination) sessionStorage.setItem(pendingReturnKey, safeDestination)
    else sessionStorage.removeItem(pendingReturnKey)
    navigate(uiRoutes.login)
  }, [navigate])
  const loginAndReturnToWishlist = useCallback(() => navigateToLoginAndReturn(uiRoutes.wishlist), [navigateToLoginAndReturn])

  useEffect(() => {
    if ((pathname === uiRoutes.wishlist || pathname === '/admin' || pathname.startsWith('/admin/')) && window.location.pathname === pathname && !readAccessToken()) {
      sessionStorage.setItem(pendingReturnKey, pathname)
      window.history.pushState({}, '', uiRoutes.login)
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [pathname])

  if (pathname === uiRoutes.login) return <LoginScreen onBack={() => navigate('/')} />
  if (pathname === uiRoutes.register) return <RegisterScreen onBack={() => navigate('/')} />
  if (pathname === '/admin' || pathname.startsWith('/admin/')) {
    if (!accessToken) return <LoginScreen onBack={() => navigate('/')} />
    if (capabilityState.status === 'idle' || capabilityState.status === 'loading') {
      return <main className="admin-access-state"><p role="status">Verificando permisos de administración...</p></main>
    }
    if (capabilityState.status === 'error') {
      return (
        <main className="admin-access-state">
          <p role="alert">No pudimos verificar tus permisos para administración. Revisá tu conexión e intentá nuevamente.</p>
          <button type="button" onClick={() => setCapabilityRetry((retry) => retry + 1)}>Reintentar</button>
        </main>
      )
    }
    const { capabilities } = capabilityState
    if (!capabilities.is_staff && !capabilities.is_superuser) {
      return (
        <main className="admin-access-state">
          <h1>Acceso restringido</h1>
          <p>Tu cuenta no tiene acceso a las herramientas de administración.</p>
          <button type="button" onClick={() => navigate('/')}>Volver a la tienda</button>
        </main>
      )
    }
    return <AdminRouter path={pathname} capabilities={capabilities} onNavigate={navigate} />
  }
  if (pathname === '/carrito') return <CartScreen onBack={() => navigate('/')} onNavigate={navigate} />
  if (pathname === uiRoutes.wishlist) return readAccessToken()
    ? <WishlistScreen onBack={() => navigate('/')} onLogin={loginAndReturnToWishlist} />
    : <LoginScreen onBack={() => navigate('/')} />
  if (pathname === uiRoutes.checkout) return <CheckoutScreen onBack={() => navigate('/carrito')} onLogin={() => navigateToLoginAndReturn(uiRoutes.checkout)} onOrder={(id) => navigate(`/mis-compras/${encodeURIComponent(id)}`)} />
  if (pathname === '/compra/resultado') return <PurchaseResultScreen />
  if (pathname === '/mis-compras') return <OrdersScreen onNavigate={navigate} />
  if (pathname.startsWith('/mis-compras/')) return <OrdersScreen orderId={decodeURIComponent(pathname.slice('/mis-compras/'.length))} onNavigate={navigate} />
  if (pathname.startsWith('/juegos/')) {
    return <ProductDetailScreen
      slug={decodeURIComponent(pathname.slice('/juegos/'.length))}
      onBack={() => navigate('/')}
      onLogin={() => navigateToLoginAndReturn(`${window.location.pathname}${window.location.search}`)}
    />
  }
  return <CatalogApp
    key={pathname}
    onNavigate={navigate}
    isCatalogPage={pathname === '/catalogo'}
    capabilityError={capabilityState.status === 'error'}
    onRetryCapabilities={() => setCapabilityRetry((retry) => retry + 1)}
    canAccessAdmin={capabilityState.status === 'ready'
      && (capabilityState.capabilities.is_staff || capabilityState.capabilities.is_superuser)}
  />
}

export default App
