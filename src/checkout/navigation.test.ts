import { describe, expect, it } from 'vitest'
import { isAllowedPaymentUrl } from './navigation'

describe('isAllowedPaymentUrl', () => {
  it.each([
    'https://www.mercadopago.com.ar/checkout/v1/redirect?pref_id=1',
    'https://sandbox.mercadopago.com.ar/checkout/v1/redirect?pref_id=1',
    'https://www.mercadopago.com/checkout',
  ])('accepts %s', (url) => expect(isAllowedPaymentUrl(url)).toBe(true))

  it.each([
    'http://www.mercadopago.com.ar/checkout',
    'https://evil.example/mercadopago.com',
    'https://mercadopago.com.evil.example/',
    'javascript:alert(1)',
    'not a url',
  ])('rejects %s', (url) => expect(isAllowedPaymentUrl(url)).toBe(false))
})
