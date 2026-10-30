import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { components } from '../types/generated/bff-api'
import { SESSION_CHANGE_EVENT } from '../auth/session'
import { purchaseErrorMessage } from '../ui/messages'
import { redirectToPayment } from './navigation'
import { apiBaseUrl, orderError, purchaseAccessToken, purchaseRequestOptions } from './api'
import { CreditSection } from './CreditSection'
import { beginCreditAttempt, checkoutCredit, clearCreditAttempt, creditAttemptMayExist, CreditError, creditErrorMessage, readCreditAttempt } from './credit'

type ShippingMode = components['schemas']['CheckoutRequest']['shipping_mode']
type AddressField = 'recipient' | 'street' | 'city' | 'postal_code' | 'phone'
type Address = components['schemas']['ShippingAddress']

const requiredFields: Array<{ key: Exclude<AddressField, 'phone'>; label: string }> = [
  { key: 'recipient', label: 'Nombre de quien recibe' },
  { key: 'street', label: 'Calle y número' },
  { key: 'city', label: 'Ciudad' },
  { key: 'postal_code', label: 'Código postal' },
]
const addressLimits: Record<AddressField, number> = { recipient: 250, street: 500, city: 150, postal_code: 32, phone: 50 }

export function CheckoutScreen({ onBack, onLogin, onOrder }: { onBack: () => void; onLogin: () => void; onOrder: (id: string) => void }) {
  const [initialAttempt] = useState(() => {
    try { return readCreditAttempt() } catch { return 'unavailable' as const }
  })
  const [shippingMode, setShippingMode] = useState<ShippingMode>('standard')
  const [address, setAddress] = useState<Address>({ recipient: '', street: '', city: '', postal_code: '', phone: '' })
  const [errors, setErrors] = useState<Partial<Record<AddressField, string>>>({})
  const [requestError, setRequestError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [payment, setPayment] = useState<'mercadopago' | 'credit'>(initialAttempt !== 'unavailable' && initialAttempt?.operation === 'checkout' ? 'credit' : 'mercadopago')
  const [creditBusy, setCreditBusy] = useState(initialAttempt !== 'unavailable' && initialAttempt?.operation === 'redeem')
  const [uncertain, setUncertain] = useState(initialAttempt !== 'unavailable' && initialAttempt?.operation === 'checkout')
  const [storageBlocked, setStorageBlocked] = useState(initialAttempt === 'unavailable')
  const [paidOrderId, setPaidOrderId] = useState<string | null>(null)
  const creditKey = useRef(initialAttempt !== 'unavailable' && initialAttempt?.operation === 'checkout' ? initialAttempt.key : undefined)
  const pendingCredit = useRef<{ key: string; request: components['schemas']['CheckoutRequest'] } | null>(null)
  const inFlight = useRef(false)
  const sessionVersion = useRef(0)
  const signedIn = Boolean(purchaseAccessToken())
  const validDelivery = shippingMode === 'pickup' || requiredFields.every(({ key }) => address[key]?.trim())

  useEffect(() => {
    const handleSessionChange = () => { sessionVersion.current += 1 }
    window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange)
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange)
  }, [])

  const updateAddress = (key: keyof Address, value: string) => {
    setAddress((current) => ({ ...current, [key]: value }))
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current || creditBusy || storageBlocked || !signedIn) return
    const nextErrors: Partial<Record<AddressField, string>> = {}
    if (shippingMode === 'standard') {
      for (const field of requiredFields) {
        if (!address[field.key]?.trim()) nextErrors[field.key] = 'Este dato es obligatorio.'
      }
      for (const [field, limit] of Object.entries(addressLimits) as Array<[AddressField, number]>) {
        if (Array.from((address[field] ?? '').trim()).length > limit) nextErrors[field] = `No puede superar ${limit} caracteres.`
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    inFlight.current = true
    setSubmitting(true)
    setRequestError(null)
    const version = sessionVersion.current
    let attempt: ReturnType<typeof beginCreditAttempt> | undefined
    try {
      const request: components['schemas']['CheckoutRequest'] = shippingMode === 'pickup'
        ? { shipping_mode: 'pickup' }
        : {
            shipping_mode: 'standard',
            address: {
              recipient: address.recipient?.trim(),
              street: address.street?.trim(),
              city: address.city?.trim(),
              postal_code: address.postal_code?.trim(),
              ...(address.phone?.trim() ? { phone: address.phone.trim() } : {}),
            },
          }
      if (payment === 'credit') {
        attempt = beginCreditAttempt('checkout', creditKey.current)
        creditKey.current = attempt.key
        pendingCredit.current ??= { key: attempt.key, request }
        const result = await checkoutCredit(pendingCredit.current.request, pendingCredit.current.key)
        if (version !== sessionVersion.current) {
          setUncertain(true)
          return
        }
        clearCreditAttempt(attempt)
        creditKey.current = undefined
        pendingCredit.current = null
        setUncertain(false)
        setPaidOrderId(result.order.id)
        return
      }
      if (readCreditAttempt()) throw new Error('Pending credit operation')
      const response = await fetch(`${apiBaseUrl}/checkout`, purchaseRequestOptions('POST', request))
      if (!response.ok) {
        const error = await orderError(response)
        setRequestError(purchaseErrorMessage(error?.code))
        return
      }
      const payload = await response.json() as components['schemas']['CheckoutResponse']
      redirectToPayment(payload.init_point)
    } catch (reason) {
      if (payment === 'credit') {
        if (version !== sessionVersion.current && attempt) {
          setUncertain(true)
          return
        }
        const unknown = !attempt ? creditAttemptMayExist(creditKey.current) : !(reason instanceof CreditError) || (reason.uncertain && !(reason.preflightRejected && !attempt.previouslyUncertain))
        try {
          if (!unknown && attempt) {
            clearCreditAttempt(attempt)
            creditKey.current = undefined
          }
          if (!unknown || (reason instanceof CreditError && (reason.code === 'IDEMPOTENCY_CONFLICT' || reason.preflightRejected))) pendingCredit.current = null
          setUncertain(unknown)
          setRequestError(creditErrorMessage(!unknown && reason instanceof CreditError && reason.uncertain ? new CreditError(reason.code, false) : reason))
        } catch (storageError) {
          setUncertain(true)
          setRequestError(creditErrorMessage(storageError))
        }
      } else {
        try {
          if (readCreditAttempt()) setStorageBlocked(true)
          setRequestError('No se pudo conectar con el servicio de pagos. Intentá nuevamente.')
        } catch (storageError) {
          setStorageBlocked(true)
          setRequestError(creditErrorMessage(storageError))
        }
      }
    } finally {
      inFlight.current = false
      setSubmitting(false)
    }
  }

  return (
    <main className="purchase-page" aria-labelledby="checkout-title">
      <button className="text-button" type="button" disabled={submitting || uncertain || creditBusy || storageBlocked} onClick={onBack}>← Volver al carrito</button>
      <h1 id="checkout-title">Finalizar compra</h1>
      {paidOrderId ? (
        <section aria-labelledby="credit-success-title">
          <h2 id="credit-success-title">¡Gracias por tu compra!</h2>
          <p role="status">Tu compra con crédito quedó confirmada.</p>
          <button className="primary-button" type="button" onClick={() => onOrder(paidOrderId)}>Ver compra y factura</button>
        </section>
      ) : !signedIn ? (
        <section className="empty-state" aria-label="Inicio de sesión requerido">
          <p>Iniciá sesión para continuar con tu compra.</p>
          <button className="primary-button" type="button" onClick={onLogin}>Iniciar sesión</button>
        </section>
      ) : (
        <form className="purchase-form" onSubmit={submit} noValidate>
          <label htmlFor="shipping-mode">Modalidad de entrega</label>
          <select id="shipping-mode" disabled={submitting || (uncertain && Boolean(pendingCredit.current)) || creditBusy || storageBlocked} value={shippingMode} onChange={(event) => setShippingMode(event.target.value as ShippingMode)}>
            <option value="standard">Envío estándar</option>
            <option value="pickup">Retiro en tienda</option>
          </select>
          {shippingMode === 'standard' && (
            <fieldset disabled={submitting || (uncertain && Boolean(pendingCredit.current)) || creditBusy || storageBlocked}>
              <legend>Datos de envío</legend>
              {requiredFields.map(({ key, label }) => (
                <label key={key} htmlFor={`shipping-${key}`}>
                  {label}
                  <input
                    id={`shipping-${key}`}
                    name={key}
                    required
                    value={address[key] ?? ''}
                    aria-invalid={Boolean(errors[key])}
                    aria-describedby={errors[key] ? `shipping-${key}-error` : undefined}
                    onChange={(event) => updateAddress(key, event.target.value)}
                  />
                  {errors[key] && <span className="field-error" id={`shipping-${key}-error`}>{errors[key]}</span>}
                </label>
              ))}
              <label htmlFor="shipping-phone">Teléfono (opcional)
                <input id="shipping-phone" name="phone" autoComplete="tel" value={address.phone ?? ''} aria-invalid={Boolean(errors.phone)} aria-describedby={errors.phone ? 'shipping-phone-error' : undefined} onChange={(event) => updateAddress('phone', event.target.value)} />
                {errors.phone && <span className="field-error" id="shipping-phone-error">{errors.phone}</span>}
              </label>
            </fieldset>
          )}
          <CreditSection disabled={submitting || uncertain || storageBlocked} recoveryKey={initialAttempt !== 'unavailable' && initialAttempt?.operation === 'redeem' ? initialAttempt.key : undefined} onBusyChange={setCreditBusy} />
          <label htmlFor="payment-method">Medio de pago</label>
          <select id="payment-method" disabled={submitting || uncertain || creditBusy || storageBlocked} value={payment} onChange={(event) => { setPayment(event.target.value as 'mercadopago' | 'credit'); setRequestError(null) }}>
            <option value="mercadopago">Mercado Pago</option>
            <option value="credit">Crédito personal</option>
          </select>
          {(requestError || storageBlocked) && <p role="alert">{requestError ?? 'No se puede acceder al almacenamiento de esta pestaña.'}</p>}
          {uncertain && <p>Reingresá los mismos datos de envío y usá la misma cuenta para reintentar. Al cerrar la pestaña se pierde el intento.</p>}
          <button className="primary-button" type="submit" disabled={submitting || creditBusy || storageBlocked || !validDelivery}>
            {payment === 'credit' ? (submitting ? 'Procesando compra…' : uncertain ? 'Reintentar compra con crédito' : 'Pagar con crédito') : (submitting ? 'Conectando con Mercado Pago…' : 'Continuar a Mercado Pago')}
          </button>
        </form>
      )}
    </main>
  )
}
