import { useState } from 'react'
import type { FormEvent } from 'react'
import type { components } from '../types/generated/bff-api'
import { purchaseErrorMessage } from '../ui/messages'
import { redirectToPayment } from './navigation'
import { apiBaseUrl, orderError, purchaseAccessToken, purchaseRequestOptions } from './api'

type ShippingMode = components['schemas']['CheckoutRequest']['shipping_mode']
type AddressField = 'recipient' | 'street' | 'city' | 'postal_code'
type Address = components['schemas']['ShippingAddress']

const requiredFields: Array<{ key: AddressField; label: string }> = [
  { key: 'recipient', label: 'Nombre de quien recibe' },
  { key: 'street', label: 'Calle y número' },
  { key: 'city', label: 'Ciudad' },
  { key: 'postal_code', label: 'Código postal' },
]

export function CheckoutScreen({ onBack, onLogin }: { onBack: () => void; onLogin: () => void }) {
  const [shippingMode, setShippingMode] = useState<ShippingMode>('standard')
  const [address, setAddress] = useState<Address>({ recipient: '', street: '', city: '', postal_code: '', phone: '' })
  const [errors, setErrors] = useState<Partial<Record<AddressField, string>>>({})
  const [requestError, setRequestError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const signedIn = Boolean(purchaseAccessToken())

  const updateAddress = (key: keyof Address, value: string) => {
    setAddress((current) => ({ ...current, [key]: value }))
    if (key in errors) setErrors((current) => ({ ...current, [key]: undefined }))
  }

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (submitting || !signedIn) return
    const nextErrors: Partial<Record<AddressField, string>> = {}
    if (shippingMode === 'standard') {
      for (const field of requiredFields) {
        if (!address[field.key]?.trim()) nextErrors[field.key] = 'Este dato es obligatorio.'
      }
    }
    setErrors(nextErrors)
    if (Object.keys(nextErrors).length) return

    setSubmitting(true)
    setRequestError(null)
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
      const response = await fetch(`${apiBaseUrl}/checkout`, purchaseRequestOptions('POST', request))
      if (!response.ok) {
        const error = await orderError(response)
        setRequestError(purchaseErrorMessage(error?.code))
        return
      }
      const payload = await response.json() as components['schemas']['CheckoutResponse']
      redirectToPayment(payload.init_point)
    } catch {
      setRequestError('No se pudo conectar con el servicio de pagos. Intentá nuevamente.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <main className="purchase-page" aria-labelledby="checkout-title">
      <button className="text-button" type="button" onClick={onBack}>← Volver al carrito</button>
      <h1 id="checkout-title">Finalizar compra</h1>
      {!signedIn ? (
        <section className="empty-state" aria-label="Inicio de sesión requerido">
          <p>Iniciá sesión para continuar con tu compra.</p>
          <button className="primary-button" type="button" onClick={onLogin}>Iniciar sesión</button>
        </section>
      ) : (
        <form className="purchase-form" onSubmit={submit} noValidate>
          <label htmlFor="shipping-mode">Modalidad de entrega</label>
          <select id="shipping-mode" value={shippingMode} onChange={(event) => setShippingMode(event.target.value as ShippingMode)}>
            <option value="standard">Envío estándar</option>
            <option value="pickup">Retiro en tienda</option>
          </select>
          {shippingMode === 'standard' && (
            <fieldset>
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
                <input id="shipping-phone" name="phone" autoComplete="tel" value={address.phone ?? ''} onChange={(event) => updateAddress('phone', event.target.value)} />
              </label>
            </fieldset>
          )}
          {requestError && <p role="alert">{requestError}</p>}
          <button className="primary-button" type="submit" disabled={submitting}>
            {submitting ? 'Conectando con Mercado Pago…' : 'Continuar a Mercado Pago'}
          </button>
        </form>
      )}
    </main>
  )
}
