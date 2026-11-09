import { describe, expect, it } from 'vitest'
import { canonicalizeUiPath } from './routes'

describe('canonicalizeUiPath', () => {
  it.each([
    ['/login', '/iniciar-sesion'],
    ['/register', '/registro'],
    ['/wishlist', '/lista-de-deseos'],
    ['/checkout', '/finalizar-compra'],
    ['/admin/products', '/admin/productos'],
    ['/admin/products/new', '/admin/productos/nuevo'],
    ['/admin/products/42', '/admin/productos/42'],
    ['/admin/promotions', '/admin/promociones'],
    ['/admin/promotions/new', '/admin/promociones/nueva'],
    ['/admin/promotions/promo-42', '/admin/promociones/promo-42'],
    ['/admin/coupons', '/admin/cupones'],
    ['/admin/coupons/new', '/admin/cupones/nuevo'],
    ['/admin/coupons/42', '/admin/cupones/42'],
    ['/admin/gift-cards/42', '/admin/tarjetas-de-regalo/42'],
    ['/admin/audit', '/admin/auditoria'],
    ['/admin/sales', '/admin/ventas'],
    ['/admin/reviews', '/admin/resenas'],
    ['/admin/users/42', '/admin/usuarios/42'],
  ])('maps %s to %s', (legacy, canonical) => {
    expect(canonicalizeUiPath(legacy)).toBe(canonical)
  })

  it('preserves query strings and fragments verbatim when mapping an alias', () => {
    expect(canonicalizeUiPath('/checkout?next=%2Fwishlist&sort=a+b#payment%2Freturn'))
      .toBe('/finalizar-compra?next=%2Fwishlist&sort=a+b#payment%2Freturn')
  })

  it('does not rewrite unrelated, boundary-sharing, API, or absolute URLs', () => {
    for (const path of [
      '/login-extra',
      '/admin/products-old',
      '/api/v1/admin/products',
      'https://foreign.example/login',
      '//foreign.example/login',
      '/compra/resultado?status=ok',
      '/juegos/checkout-expansion',
    ]) {
      expect(canonicalizeUiPath(path)).toBe(path)
    }
    expect(canonicalizeUiPath('/admin/products/newspaper')).toBe('/admin/productos/newspaper')
  })
})
