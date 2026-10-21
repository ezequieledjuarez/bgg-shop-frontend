import { useEffect, useState } from 'react'
import type { components } from '../types/generated/bff-api'
import { apiBaseUrl, purchaseRequestOptions } from '../checkout/api'
import { cartMessages } from '../ui/messages'

type Product = components['schemas']['Product']
type WishlistResponse = components['schemas']['WishlistResponse']
type CartResponse = components['schemas']['CartResponse']
type ErrorResponse = components['schemas']['ErrorResponse']
type OrderErrorResponse = components['schemas']['OrderErrorResponse']

function errorMessage(payload: unknown, fallback: string) {
  if (typeof payload === 'object' && payload !== null && 'errors' in payload) {
    const errors = payload.errors as OrderErrorResponse['errors']
    if (errors?.[0]?.message) return errors[0].message
  }
  if (typeof payload === 'object' && payload !== null && 'error' in payload && typeof payload.error === 'string') {
    return fallback
  }
  return fallback
}

export function WishlistScreen({ onBack, onLogin }: { onBack: () => void; onLogin: () => void }) {
  const [items, setItems] = useState<Product[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error' | 'warning'; message: string } | null>(null)
  const [pendingId, setPendingId] = useState<number | null>(null)
  const [retry, setRetry] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    fetch(`${apiBaseUrl}/wishlist`, { ...purchaseRequestOptions('GET'), signal: controller.signal })
      .then(async (response) => {
        if (response.status === 401) {
          onLogin()
          return null
        }
        if (!response.ok) {
          const payload: unknown = await response.json().catch(() => undefined)
          throw new Error(errorMessage(payload, 'No se pudo cargar tu lista de deseos.'))
        }
        return response.json() as Promise<WishlistResponse>
      })
      .then((payload) => {
        if (payload) {
          setItems(payload.items)
          setLoadState('success')
        }
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(reason instanceof Error ? reason.message : 'No se pudo cargar tu lista de deseos.')
        setLoadState('error')
      })
    return () => controller.abort()
  }, [retry, onLogin])

  const removeItem = async (product: Product) => {
    if (pendingId !== null) return
    setPendingId(product.bgg_id)
    setFeedback(null)
    try {
      const response = await fetch(`${apiBaseUrl}/wishlist/${product.bgg_id}`, purchaseRequestOptions('DELETE'))
      if (response.status === 401) {
        onLogin()
        return
      }
      if (!response.ok) {
        const payload: unknown = await response.json().catch(() => undefined)
        throw new Error(errorMessage(payload, 'No se pudo quitar el juego de tu lista de deseos.'))
      }
      setItems((current) => current.filter((item) => item.bgg_id !== product.bgg_id))
      setFeedback({ kind: 'success', message: `${product.name} se quitó de tu lista de deseos.` })
    } catch (reason) {
      setFeedback({
        kind: 'error',
        message: reason instanceof Error ? reason.message : 'No se pudo quitar el juego de tu lista de deseos.',
      })
    } finally {
      setPendingId(null)
    }
  }

  const addToCart = async (product: Product) => {
    if (pendingId !== null || product.quantity === 0) return
    setPendingId(product.bgg_id)
    setFeedback(null)
    try {
      const request: components['schemas']['CartItemRequest'] = { bgg_id: product.bgg_id, quantity: 1 }
      const response = await fetch(`${apiBaseUrl}/cart/items`, purchaseRequestOptions('POST', request))
      const payload = await response.json() as CartResponse | ErrorResponse
      if (response.status === 401) {
        onLogin()
        return
      }
      if ('warnings' in payload && payload.warnings.length > 0) {
        setFeedback({ kind: 'warning', message: payload.warnings.map((warning) => warning.message).join(' ') })
        return
      }
      if (!response.ok || !('lines' in payload)) {
        throw new Error(errorMessage(payload, cartMessages.addError))
      }
      setFeedback({ kind: 'success', message: cartMessages.addSuccess(product.name) })
    } catch (reason) {
      setFeedback({
        kind: 'error',
        message: reason instanceof Error ? reason.message : cartMessages.addError,
      })
    } finally {
      setPendingId(null)
    }
  }

  return (
    <main className="wishlist-page" aria-labelledby="wishlist-title">
      <button className="text-button" type="button" onClick={onBack}>← Volver al catálogo</button>
      <h1 id="wishlist-title">Lista de deseos</h1>
      {feedback && <p role={feedback.kind === 'error' ? 'alert' : 'status'}>{feedback.message}</p>}
      {loadState === 'loading' ? (
        <div className="empty-state" role="status">Cargando tu lista de deseos...</div>
      ) : loadState === 'error' ? (
        <div className="empty-state" role="alert">
          <h2>No se pudo cargar tu lista de deseos</h2>
          <p>{loadError}</p>
          <button className="primary-button" type="button" onClick={() => {
            setLoadError(null)
            setLoadState('loading')
            setRetry((value) => value + 1)
          }}>Reintentar</button>
        </div>
      ) : items.length === 0 ? (
        <p className="empty-state" role="status">Tu lista de deseos está vacía.</p>
      ) : (
        <ul className="wishlist-items" aria-label="Juegos en tu lista de deseos">
          {items.map((product) => (
            <li className="wishlist-item" key={product.bgg_id} aria-label={product.name}>
              <img src={product.image_url} alt={`Portada de ${product.name}`} />
              <div className="wishlist-item-content">
                <h2>{product.name}</h2>
                <p>{product.publisher} · {product.release_year}</p>
                <p>{cartMessages.availableStock(product.quantity)}</p>
                <strong>{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(product.price)}</strong>
                <div className="wishlist-item-actions">
                  <button
                    className="primary-button"
                    type="button"
                    disabled={pendingId !== null || product.quantity === 0}
                    onClick={() => void addToCart(product)}
                    aria-label={product.quantity === 0 ? `${product.name}: sin stock` : cartMessages.add(product.name)}
                  >
                    {product.quantity === 0 ? 'Sin stock' : pendingId === product.bgg_id ? 'Agregando...' : cartMessages.add(product.name)}
                  </button>
                  <button
                    className="text-button"
                    type="button"
                    disabled={pendingId !== null}
                    onClick={() => void removeItem(product)}
                    aria-label={`Quitar ${product.name} de mi lista`}
                  >
                    {pendingId === product.bgg_id ? 'Procesando...' : 'Quitar de mi lista'}
                  </button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
