import { SESSION_STORAGE_KEY } from '../auth/session'
import { purchaseErrorMessage } from '../ui/messages'
import type { components } from '../types/generated/bff-api'

type ErrorPayload = components['schemas']['OrderErrorResponse']
export type PurchaseOrder = components['schemas']['PurchaseOrder']
export type CheckoutRequest = components['schemas']['CheckoutRequest']
export type ConfirmPaymentRequest = components['schemas']['ConfirmPaymentRequest']

export const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

export function purchaseAccessToken() {
  try {
    const session = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? '{}') as { access_token?: string }
    return session.access_token
  } catch {
    return undefined
  }
}

export function purchaseRequestOptions(method: string, body?: unknown): RequestInit {
  const headers = new Headers()
  if (body !== undefined) headers.set('Content-Type', 'application/json')
  const token = purchaseAccessToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  return {
    method,
    headers,
    credentials: 'include',
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }
}

export async function orderError(response: Response) {
  try {
    const payload = await response.json() as ErrorPayload
    return payload.errors?.[0]
  } catch {
    return undefined
  }
}

export async function confirmPayment(request: ConfirmPaymentRequest): Promise<PurchaseOrder> {
  const response = await fetch(`${apiBaseUrl}/checkout/confirm`, purchaseRequestOptions('POST', request))
  if (!response.ok) {
    const error = await orderError(response)
    throw new Error(purchaseErrorMessage(error?.code))
  }
  const payload = await response.json() as components['schemas']['OrderResponse']
  return payload.order
}

export async function downloadInvoice(orderId: string) {
  const response = await fetch(`${apiBaseUrl}/orders/${encodeURIComponent(orderId)}/invoice`, purchaseRequestOptions('GET'))
  if (!response.ok) {
    const error = await orderError(response)
    throw new Error(error ? purchaseErrorMessage(error.code) : 'No se pudo descargar la factura. Intentá nuevamente.')
  }
  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `factura-${orderId}.pdf`
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
