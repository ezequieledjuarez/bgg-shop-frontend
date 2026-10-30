import { useEffect, useRef, useState } from 'react'
import type { components } from '../types/generated/bff-api'
import { purchaseErrorMessage } from '../ui/messages'
import { redirectToPayment } from './navigation'
import { apiBaseUrl, confirmPayment, downloadInvoice, orderError, purchaseAccessToken, purchaseRequestOptions } from './api'

type PurchaseOrder = components['schemas']['PurchaseOrder']
type LoadState = 'loading' | 'error' | 'success'

function formatTotal(total: number, currency: string) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: currency || 'ARS' }).format(total)
}

function orderStatus(status: string) {
  switch (status) {
    case 'paid': return 'Pagada'
    case 'rejected': return 'Pago rechazado'
    case 'pending_payment': return 'Pago pendiente'
    case 'paid_stock_conflict': return 'Pago recibido, sin stock'
    case 'cancelled': return 'Cancelada'
    default: return status
  }
}

function InvoiceButton({ orderId }: { orderId: string }) {
  const [downloading, setDownloading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const download = async () => {
    if (downloading) return
    setDownloading(true)
    setError(null)
    try {
      await downloadInvoice(orderId)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo descargar la factura.')
    } finally {
      setDownloading(false)
    }
  }
  return <>
    <button className="text-button" type="button" onClick={() => void download()} disabled={downloading}>
      {downloading ? 'Descargando factura…' : 'Descargar factura'}
    </button>
    {error && <p role="alert">{error}</p>}
  </>
}

function OrderSummary({ order }: { order: PurchaseOrder }) {
  return <>
    <p>Fecha: {new Date(order.created_at).toLocaleDateString('es-AR')}</p>
    <p>Estado: {orderStatus(order.status)}</p>
    <p>Total: {formatTotal(order.total, order.currency)}</p>
    <ul aria-label="Productos de la compra">
      {order.lines.map((line) => <li key={`${line.bgg_id}-${line.name}`}>{line.name} · {line.quantity} × {formatTotal(line.unit_price, order.currency)} · {formatTotal(line.subtotal, order.currency)}</li>)}
    </ul>
  </>
}

export function OrdersScreen({ orderId, onNavigate }: { orderId?: string; onNavigate: (path: string) => void }) {
  const [orders, setOrders] = useState<PurchaseOrder[]>([])
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [error, setError] = useState<string | null>(null)
  const [retry, setRetry] = useState(0)
  const signedIn = Boolean(purchaseAccessToken())

  useEffect(() => {
    if (!signedIn) return
    const controller = new AbortController()
    const url = orderId ? `${apiBaseUrl}/orders/${encodeURIComponent(orderId)}` : `${apiBaseUrl}/orders`
    fetch(url, { ...purchaseRequestOptions('GET'), signal: controller.signal }).then(async (response) => {
      if (!response.ok) {
        const apiError = await orderError(response)
        throw new Error(apiError?.code && apiError.code !== 'UPSTREAM_ERROR' ? purchaseErrorMessage(apiError.code) : 'No se pudieron cargar las compras. Intentá nuevamente.')
      }
      if (orderId) {
        const payload = await response.json() as components['schemas']['OrderResponse']
        setOrder(payload.order)
      } else {
        const payload = await response.json() as components['schemas']['OrderListResponse']
        setOrders(payload.orders)
      }
      setLoadState('success')
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return
      setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las compras.')
      setLoadState('error')
    })
    return () => controller.abort()
  }, [orderId, retry, signedIn])

  if (!signedIn) return <main className="purchase-page"><h1>Mis Compras</h1><p>Iniciá sesión para consultar tus compras.</p><button className="primary-button" type="button" onClick={() => onNavigate('/login')}>Iniciar sesión</button></main>
  if (loadState === 'loading') return <main className="purchase-page"><h1>{orderId ? 'Detalle de la compra' : 'Mis Compras'}</h1><p role="status">Cargando compras…</p></main>
  if (loadState === 'error') return <main className="purchase-page"><h1>{orderId ? 'Detalle de la compra' : 'Mis Compras'}</h1><p role="alert">{error}</p><button className="primary-button" type="button" onClick={() => { setLoadState('loading'); setError(null); setRetry((value) => value + 1) }}>Reintentar</button></main>

  if (orderId) {
    if (!order) return <main className="purchase-page"><h1>Detalle de la compra</h1><p role="alert">No se encontró la compra solicitada.</p><button className="text-button" type="button" onClick={() => onNavigate('/mis-compras')}>Volver a Mis Compras</button></main>
    return <main className="purchase-page" aria-labelledby="order-detail-title">
      <button className="text-button" type="button" onClick={() => onNavigate('/mis-compras')}>← Volver a Mis Compras</button>
      <h1 id="order-detail-title">Detalle de la compra</h1>
      <article className="order-detail"><h2>Compra {order.id}</h2><OrderSummary order={order} />
        {order.status === 'paid' && <InvoiceButton orderId={order.id} />}
      </article>
    </main>
  }

  return <main className="purchase-page" aria-labelledby="orders-title">
    <h1 id="orders-title">Mis Compras</h1>
    {orders.length === 0 ? <p className="empty-state" role="status">Todavía no tenés compras.</p> : (
      <ul className="order-list" aria-label="Historial de compras">
        {orders.map((item) => <li key={item.id}>
          <div><strong>{new Date(item.created_at).toLocaleDateString('es-AR')}</strong><span>{orderStatus(item.status)}</span><span>{formatTotal(item.total, item.currency)}</span></div>
          <button className="text-button" type="button" onClick={() => onNavigate(`/mis-compras/${item.id}`)}>Ver detalle</button>
        </li>)}
      </ul>
    )}
  </main>
}

export function PurchaseResultScreen() {
  const params = new URLSearchParams(window.location.search)
  const paymentId = params.get('payment_id') ?? params.get('collection_id')
  const orderId = params.get('external_reference') ?? params.get('order_id')
  const [order, setOrder] = useState<PurchaseOrder | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [retrying, setRetrying] = useState(false)
  const [retryBlocked, setRetryBlocked] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const requests = useRef(new Map<string, Promise<PurchaseOrder>>())

  useEffect(() => {
    let active = true
    if (!paymentId || !orderId) return () => { active = false }
    const key = `${orderId}:${paymentId}:${attempt}`
    let request = requests.current.get(key)
    if (!request) {
      request = confirmPayment({ order_id: orderId, payment_id: paymentId })
      requests.current.set(key, request)
    }
    request.then((confirmed) => {
      if (!active) return
      setOrder(confirmed)
      setLoading(false)
    }).catch((reason: unknown) => {
      if (!active) return
      setError(reason instanceof Error ? reason.message : 'No se pudo verificar el pago.')
      setLoading(false)
    })
    return () => { active = false }
  }, [attempt, orderId, paymentId])

  const retryPayment = async () => {
    if (!order || retrying || retryBlocked) return
    setRetrying(true)
    setError(null)
    try {
      const response = await fetch(`${apiBaseUrl}/orders/${encodeURIComponent(order.id)}/retry-payment`, purchaseRequestOptions('POST'))
      if (!response.ok) {
        const apiError = await orderError(response)
        if (apiError?.code === 'PENDING_PAYMENT' || apiError?.code === 'PAYMENT_REQUIRES_REVIEW') setRetryBlocked(true)
        throw new Error(purchaseErrorMessage(apiError?.code))
      }
      const payload = await response.json() as components['schemas']['CheckoutResponse']
      redirectToPayment(payload.init_point)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'No se pudo iniciar un nuevo pago.')
    } finally {
      setRetrying(false)
    }
  }

  if (!paymentId || !orderId) return <main className="purchase-page"><h1>Resultado de tu compra</h1><p role="alert">No encontramos los datos necesarios para verificar el pago. Revisá el historial en Mis Compras.</p></main>
  if (loading) return <main className="purchase-page"><h1>Resultado de tu compra</h1><p role="status">Verificando el pago…</p></main>
  if (error && !order) return <main className="purchase-page"><h1>Resultado de tu compra</h1><p role="alert">{error}</p></main>
  if (!order) return <main className="purchase-page"><h1>Resultado de tu compra</h1><p role="alert">No se pudo verificar el pago.</p></main>

  if (order.status === 'paid_stock_conflict') return <main className="purchase-page" aria-labelledby="purchase-result-title">
    <h1 id="purchase-result-title">Pago recibido</h1>
    <p role="alert">Recibimos tu pago, pero el stock se agotó antes de confirmar la compra. Contactá a soporte para resolverlo; no vuelvas a pagar.</p>
    <OrderSummary order={order} />
  </main>

  if (order.status === 'rejected') return <main className="purchase-page" aria-labelledby="purchase-result-title">
    <h1 id="purchase-result-title">No se pudo aprobar el pago</h1>
    <p role="alert">{order.payment_status_detail ? `Motivo informado: ${order.payment_status_detail}` : 'El medio de pago rechazó la operación.'}</p>
    {error && <p role="alert">{error}</p>}
    <button className="primary-button" type="button" onClick={() => void retryPayment()} disabled={retrying || retryBlocked}>{retrying ? 'Preparando el pago…' : 'Reintentar pago'}</button>
  </main>

  if (order.status !== 'paid') return <main className="purchase-page" aria-labelledby="purchase-result-title">
    <h1 id="purchase-result-title">Pago pendiente</h1>
    <p role="status">Todavía no recibimos la confirmación del pago. Podés verificarlo nuevamente en unos instantes.</p>
    {error && <p role="alert">{error}</p>}
    <button className="primary-button" type="button" onClick={() => { setError(null); setLoading(true); setAttempt((value) => value + 1) }}>Verificar de nuevo</button>
  </main>

  return <main className="purchase-page" aria-labelledby="purchase-result-title">
    <h1 id="purchase-result-title">¡Gracias por tu compra!</h1>
    <p role="status">Tu pago fue aprobado y la compra quedó confirmada.</p>
    <article className="order-detail"><h2>Resumen de la compra</h2><OrderSummary order={order} /><InvoiceButton orderId={order.id} /></article>
    <a className="text-button" href="/mis-compras">Ir a Mis Compras</a>
  </main>
}
