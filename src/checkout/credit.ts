import type { components } from '../types/generated/bff-api'
import { apiBaseUrl, purchaseAccessToken, purchaseRequestOptions } from './api'

export type CreditBalance = components['schemas']['CreditBalance']
type RedeemRequest = components['schemas']['RedeemGiftCardRequest']
type CheckoutRequest = components['schemas']['CheckoutRequest']
type CheckoutResponse = components['schemas']['CreditCheckoutResponse']

type CreditOperation = 'redeem' | 'checkout'
type StoredCreditAttempt = { operation: CreditOperation; key: string; accountId: string }
type CreditAttempt = StoredCreditAttempt & { previouslyUncertain: boolean }
const attemptStorageKey = 'checkout.credit-attempt'

export class CreditStorageError extends Error {}
export class CreditIdentityError extends Error {}

function validAccountId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 512 && value === value.trim() && !Array.from(value).some((character) => character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127)
}

function accountId(): string {
  try {
    const token = purchaseAccessToken()
    const parts = token?.split('.')
    if (!parts || parts.length !== 3 || !parts.every(Boolean) || !/^[A-Za-z0-9_-]+$/.test(parts[1])) throw new Error()
    const bytes = Uint8Array.from(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')), (character) => character.charCodeAt(0))
    const payload: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
    if (!payload || typeof payload !== 'object' || !('sub' in payload) || !validAccountId(payload.sub)) throw new Error()
    return payload.sub
  } catch {
    throw new CreditIdentityError()
  }
}

export function readCreditAttempt(): StoredCreditAttempt | null {
  try {
    const stored = sessionStorage.getItem(attemptStorageKey)
    if (stored === null) return null
    const value: unknown = JSON.parse(stored)
    if (!value || typeof value !== 'object') throw new Error()
    const attempt = value as Partial<StoredCreditAttempt>
    if ((attempt.operation !== 'redeem' && attempt.operation !== 'checkout') || typeof attempt.key !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(attempt.key) || !validAccountId(attempt.accountId) || Object.keys(attempt).length !== 3) throw new Error()
    return { operation: attempt.operation, key: attempt.key, accountId: attempt.accountId }
  } catch {
    throw new CreditStorageError()
  }
}

export function creditAttemptMayExist(expectedKey?: string): boolean {
  if (expectedKey) return true
  try {
    return readCreditAttempt() !== null
  } catch {
    return true
  }
}

export function beginCreditAttempt(operation: CreditOperation, expectedKey?: string): CreditAttempt {
  const existing = readCreditAttempt()
  const currentAccountId = accountId()
  if (existing) {
    if (existing.accountId !== currentAccountId) throw new CreditIdentityError()
    if (existing.operation !== operation || (expectedKey && existing.key !== expectedKey)) throw new CreditStorageError()
    try {
      sessionStorage.setItem(attemptStorageKey, JSON.stringify(existing))
      const stored = readCreditAttempt()
      if (!stored || stored.key !== existing.key || stored.operation !== existing.operation || stored.accountId !== existing.accountId) throw new Error()
    } catch {
      throw new CreditStorageError()
    }
    return { ...existing, previouslyUncertain: true }
  }
  if (expectedKey) throw new CreditStorageError()
  const attempt = { operation, key: crypto.randomUUID(), accountId: currentAccountId }
  try {
    sessionStorage.setItem(attemptStorageKey, JSON.stringify(attempt))
    const stored = readCreditAttempt()
    if (!stored || stored.key !== attempt.key || stored.operation !== attempt.operation || stored.accountId !== attempt.accountId) throw new Error()
  } catch {
    throw new CreditStorageError()
  }
  return { ...attempt, previouslyUncertain: false }
}

export function clearCreditAttempt(attempt: CreditAttempt): void {
  try {
    const existing = readCreditAttempt()
    if (!existing || existing.key !== attempt.key || existing.operation !== attempt.operation || existing.accountId !== attempt.accountId || accountId() !== attempt.accountId) throw new Error()
    sessionStorage.removeItem(attemptStorageKey)
    if (readCreditAttempt() !== null) throw new Error()
  } catch {
    throw new CreditStorageError()
  }
}

export class CreditError extends Error {
  constructor(public readonly code: string, public readonly uncertain: boolean, public readonly preflightRejected = false) {
    super(code)
  }
}

function validBalance(value: unknown): value is CreditBalance {
  if (!value || typeof value !== 'object') return false
  const balance = value as Partial<CreditBalance>
  return typeof balance.balance === 'string' && /^\d+\.\d{2}$/.test(balance.balance) && balance.currency === 'ARS'
}

async function request(path: string, method: 'GET' | 'POST', body?: RedeemRequest | CheckoutRequest, key?: string, signal?: AbortSignal): Promise<unknown> {
  const options = purchaseRequestOptions(method, body)
  if (key) (options.headers as Headers).set('Idempotency-Key', key)
  const response = await fetch(`${apiBaseUrl}${path}`, { ...options, cache: 'no-store', signal })
  if (!response.ok) {
    if (response.status >= 500 || response.status === 408 || response.status === 429) throw new CreditError('UNKNOWN', true)
    const payload = await response.json().catch(() => null) as components['schemas']['CreditErrorResponse'] | null
    const code = payload?.errors?.[0]?.code ?? 'UNKNOWN'
    const definitive = ['INVALID_GIFT_CARD', 'INSUFFICIENT_CREDIT', 'INSUFFICIENT_STOCK', 'EMPTY_CART', 'PENDING_PAYMENT']
    const persistedAddressError = path === '/checkout/credit' && response.status === 400 && code === 'ADDRESS_REQUIRED_RECORDED'
    const uncertain = !persistedAddressError && (response.status === 400 || !definitive.includes(code))
    throw new CreditError(code, uncertain, response.status === 400 && !persistedAddressError)
  }
  try {
    return await response.json() as unknown
  } catch {
    throw new CreditError('UNKNOWN', method === 'POST')
  }
}

export async function getCredit(signal: AbortSignal): Promise<CreditBalance> {
  const result = await request('/credit', 'GET', undefined, undefined, signal)
  if (!validBalance(result)) throw new CreditError('UNKNOWN', false)
  return result
}

export async function redeemCredit(code: string, key: string): Promise<CreditBalance> {
  const result = await request('/gift-cards/redeem', 'POST', { code }, key)
  if (!validBalance(result)) throw new CreditError('UNKNOWN', true)
  return result
}

export async function checkoutCredit(payload: CheckoutRequest, key: string): Promise<CheckoutResponse> {
  const result = await request('/checkout/credit', 'POST', payload, key)
  if (!result || typeof result !== 'object') throw new CreditError('UNKNOWN', true)
  const checkout = result as Partial<CheckoutResponse>
  if (!validBalance(checkout.credit) || !checkout.order || typeof checkout.order.id !== 'string' || checkout.order.status !== 'paid' || !checkout.order.invoice) {
    throw new CreditError('UNKNOWN', true)
  }
  return checkout as CheckoutResponse
}

export function creditErrorMessage(error: unknown): string {
  if (error instanceof CreditIdentityError) return 'La cuenta actual no coincide con el intento pendiente o no tiene una identidad válida.'
  if (error instanceof CreditStorageError) return 'No se puede acceder al almacenamiento de esta pestaña. Recuperá el acceso antes de reintentar.'
  if (error instanceof CreditError && error.code === 'IDEMPOTENCY_CONFLICT') return 'Los datos no coinciden con el intento anterior. Reingresá los datos originales y reintentá con la misma cuenta.'
  if (!(error instanceof CreditError) || error.uncertain) return 'No se pudo confirmar la operación. Reintentá sin cambiar los datos.'
  switch (error.code) {
    case 'INVALID_GIFT_CARD': return 'La gift card no se puede canjear.'
    case 'INSUFFICIENT_CREDIT': return 'No tenés crédito suficiente para esta compra.'
    case 'INSUFFICIENT_STOCK': return 'No hay stock suficiente para completar la compra.'
    case 'EMPTY_CART': return 'Tu carrito está vacío.'
    case 'ADDRESS_REQUIRED_RECORDED': return 'Revisá los datos de envío e intentá nuevamente.'
    case 'PENDING_PAYMENT': return 'Tenés un pago de Mercado Pago pendiente. Resolvelo antes de pagar con crédito.'
    case 'UNAUTHENTICATED': return 'Iniciá sesión para continuar.'
    default: return 'No se pudo completar la operación. Revisá los datos e intentá nuevamente.'
  }
}