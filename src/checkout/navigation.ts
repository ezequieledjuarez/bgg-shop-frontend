const PAYMENT_HOST = /(^|\.)mercado(pago|libre)\.com(\.[a-z]{2})?$/

export function isAllowedPaymentUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && PAYMENT_HOST.test(url.hostname)
  } catch {
    return false
  }
}

export function redirectToPayment(url: string) {
  if (!isAllowedPaymentUrl(url)) throw new Error('La dirección de pago recibida no es válida.')
  window.location.assign(url)
}
