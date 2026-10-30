import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { LoginScreen, RegisterScreen } from './auth/AuthScreens';
import { SESSION_CHANGE_EVENT, SESSION_STORAGE_KEY } from './auth/session';
import './App.css';
import type { components } from './types/generated/bff-api'
import { cartErrorMessage, cartMessages, reviewErrorMessage } from './ui/messages'
import { CheckoutScreen } from './checkout/CheckoutScreen'
import { OrdersScreen, PurchaseResultScreen } from './checkout/OrdersScreen'
import { WishlistScreen } from './wishlist/WishlistScreen'
import AdminRouter from './admin/AdminRouter'

type SortOrder = 'featured' | 'price-low' | 'price-high'

type Product = components['schemas']['Product'] & { featured?: boolean }
type ProductPage = components['schemas']['ProductPage']
type CartResponse = components['schemas']['CartResponse']
type ErrorResponse = components['schemas']['ErrorResponse']
type OrderErrorResponse = components['schemas']['OrderErrorResponse']
type ProductDetail = components['schemas']['ProductDetail']
type CreateReviewRequest = components['schemas']['CreateReviewRequest']

const pendingReturnKey = 'bgg-shop.pending-return'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

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
        {product.featured && <span className="badge">Destacado</span>}
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
          {showLoginPrompt && <p role="status">Iniciá sesión para continuar con tu compra. <a href="/login" onClick={(event) => { event.preventDefault(); sessionStorage.setItem(pendingReturnKey, '/checkout'); onNavigate('/login') }}>Iniciar sesión</a></p>}
          <button className="primary-button" type="button" disabled={cart.lines.length === 0 || pendingId !== null} onClick={() => {
            if (!readAccessToken()) setShowLoginPrompt(true)
            else onNavigate('/checkout')
          }}>Proceder al Pago</button>
        </>
      ) : null}
    </main>
  )
}

function CatalogApp({ onNavigate }: { onNavigate: (path: string) => void }) {
  const [isAuthenticated, setIsAuthenticated] = useState(
    () => Boolean(sessionStorage.getItem(SESSION_STORAGE_KEY)),
  )
  const [products, setProducts] = useState<Product[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const [searchDraft, setSearchDraft] = useState('')
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')
  const [minPlayers, setMinPlayers] = useState('')
  const [maxPlayers, setMaxPlayers] = useState('')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState<SortOrder>('featured')
  const [addingProductId, setAddingProductId] = useState<number | null>(null)
  const [cartFeedback, setCartFeedback] = useState<string | null>(null)
  const [cartFeedbackError, setCartFeedbackError] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: '1', page_size: '100' })
    if (search.trim()) params.set('search', search.trim())
    if (year) params.set('year_published', year)
    if (minPlayers) params.set('min_players', minPlayers)
    if (maxPlayers) params.set('max_players', maxPlayers)
    if (minPrice) params.set('price_min', minPrice)
    if (maxPrice) params.set('price_max', maxPrice)

    setLoading(true)
    setError(null)
    fetch(`${import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'}/products?${params}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('No se pudo cargar el catálogo.')
        return response.json() as Promise<ProductPage>
      })
      .then((page) => setProducts(page.items))
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === 'AbortError') return
        setError(reason instanceof Error ? reason.message : 'No se pudo cargar el catálogo.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [search, year, minPlayers, maxPlayers, minPrice, maxPrice, retry])

  const clearFilters = () => {
    setSearchDraft('')
    setSearch('')
    setYear('')
    setMinPlayers('')
    setMaxPlayers('')
    setMinPrice('')
    setMaxPrice('')
    setSort('featured')
  }

  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSearch(searchDraft.trim())
  }

  useEffect(() => {
    const handleSessionChange = () => {
      setIsAuthenticated(Boolean(sessionStorage.getItem(SESSION_STORAGE_KEY)))
    }
    window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange)
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange)
  }, [])

  const handleLogout = () => {
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
      return Number(second.featured) - Number(first.featured)
    })

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Meeple, inicio">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>Meeple</span>
        </a>
        <nav className="main-nav" aria-label="Navegación principal">
          <a className="active" href="#catalogo">Catálogo</a>
          <a href="#categorias">Categorías</a>
          <a href="#editorial">Editoriales</a>
          <a href="/carrito" onClick={(event) => { event.preventDefault(); onNavigate("/carrito") }}>{cartMessages.openCart}</a>
          {isAuthenticated && <a href="/wishlist" onClick={(event) => { event.preventDefault(); onNavigate('/wishlist') }}>Lista de deseos</a>}
          {isAuthenticated && <a href="/mis-compras" onClick={(event) => { event.preventDefault(); onNavigate("/mis-compras") }}>Mis Compras</a>}
        </nav>
        <div className="account-actions">
          {isAuthenticated ? (
            <button className="logout-button" type="button" onClick={handleLogout}>Cerrar sesión</button>
          ) : (
            <>
              <a className="login-button" href="/login">Iniciar sesión</a>
              <a className="main-nav-account" href="/register">Crear cuenta</a>
            </>
          )}
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
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
            <a className="primary-button" href="#catalogo">Explorar catálogo <span aria-hidden="true">↗</span></a>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="sun"></div>
            <div className="hero-card hero-card-back"></div>
            <div className="hero-card hero-card-front"><span className="art-label">Play<br />together</span><span className="art-symbol">✦</span></div>
            <span className="art-spark spark-one">✦</span><span className="art-spark spark-two">·</span>
          </div>
        </section>

        <section className="catalog-section" id="catalogo" aria-labelledby="catalog-title">
          <div className="section-heading">
            <div><p className="eyebrow">Selección de la casa</p><h2 id="catalog-title">Juegos para disfrutar</h2></div>
            <a className="view-all" href="#catalogo">Ver todo <span aria-hidden="true">→</span></a>
          </div>
          <div className="filter-panel" aria-label="Filtros del catálogo">
            <div className="filter-row">
              <label>Año de publicación
                <input type="number" min="0" value={year} onChange={(event) => setYear(event.target.value)} />
              </label>
              <label>Mínimo de jugadores
                <input type="number" min="1" value={minPlayers} onChange={(event) => setMinPlayers(event.target.value)} />
              </label>
              <label>Máximo de jugadores
                <input type="number" min="1" value={maxPlayers} onChange={(event) => setMaxPlayers(event.target.value)} />
              </label>
              <label>Precio mínimo
                <input type="number" min="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} />
              </label>
              <label>Precio máximo
                <input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
              </label>
            </div>
            <div className="catalog-toolbar">
              <label className="sort-control">Ordenar por
                <select value={sort} onChange={(event) => setSort(event.target.value as SortOrder)} aria-label="Ordenar productos">
                  <option value="featured">Recomendados</option>
                  <option value="price-low">Precio menor</option>
                  <option value="price-high">Precio mayor</option>
                </select>
              </label>
            </div>
            <div className="results-summary" aria-live="polite">{visibleProducts.length} resultados</div>
            <button type="button" className="clear-filters" onClick={clearFilters}>Limpiar filtros</button>
          </div>
          {cartFeedback && <p role={cartFeedbackError ? "alert" : "status"} aria-live={cartFeedbackError ? "assertive" : "polite"}>{cartFeedback}</p>}
          {loading ? (
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
        </section>

        <section className="editorial-banner" id="editorial" aria-label="Manifiesto de Meeple">
          <p className="eyebrow">Más que una tienda</p>
          <h2>El mundo es mejor<br /><em>cuando jugamos juntos.</em></h2>
          <p>Elegimos cada título pensando en esos momentos que se quedan contigo mucho después de guardar la caja.</p>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand" href="/" aria-label="Meeple, inicio"><span className="brand-mark" aria-hidden="true">M</span><span>Meeple</span></a>
        <p>Juegos con intención, partidas con alma.</p>
        <small>© 2024 Meeple</small>
      </footer>
    </div>
  )
}

function App() {
  const [pathname, setPathname] = useState(window.location.pathname)

  useEffect(() => {
    const handlePopState = () => {
      let nextPath = window.location.pathname
      if (nextPath === '/' && readAccessToken()) {
        const destination = sessionStorage.getItem(pendingReturnKey)
        if (destination) {
          sessionStorage.removeItem(pendingReturnKey)
          window.history.pushState({}, '', destination)
          nextPath = destination
        }
      }
      setPathname(nextPath)
    }
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  const navigate = useCallback((path: string) => {
    window.history.pushState({}, '', path)
    setPathname(path)
  }, [])

  const navigateToLoginAndReturn = useCallback((destination: string) => {
    sessionStorage.setItem(pendingReturnKey, destination)
    navigate('/login')
  }, [navigate])
  const loginAndReturnToWishlist = useCallback(() => navigateToLoginAndReturn('/wishlist'), [navigateToLoginAndReturn])

  useEffect(() => {
    if ((pathname === '/wishlist' || pathname.startsWith('/admin')) && window.location.pathname === pathname && !readAccessToken()) {
      sessionStorage.setItem(pendingReturnKey, pathname)
      window.history.pushState({}, '', '/login')
      window.dispatchEvent(new PopStateEvent('popstate'))
    }
  }, [pathname])

  if (pathname === '/login') return <LoginScreen onBack={() => navigate('/')} />
  if (pathname === '/register') return <RegisterScreen onBack={() => navigate('/')} />
  if (pathname.startsWith('/admin')) return readAccessToken() ? <AdminRouter path={pathname} /> : <LoginScreen onBack={() => navigate('/')} />
  if (pathname === '/carrito') return <CartScreen onBack={() => navigate('/')} onNavigate={navigate} />
  if (pathname === '/wishlist') return readAccessToken()
    ? <WishlistScreen onBack={() => navigate('/')} onLogin={loginAndReturnToWishlist} />
    : <LoginScreen onBack={() => navigate('/')} />
  if (pathname === '/checkout') return <CheckoutScreen onBack={() => navigate('/carrito')} onLogin={() => navigateToLoginAndReturn('/checkout')} onOrder={(id) => navigate(`/mis-compras/${encodeURIComponent(id)}`)} />
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
  return <CatalogApp onNavigate={navigate} />
}

export default App
