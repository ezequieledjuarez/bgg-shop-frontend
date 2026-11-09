export const uiRoutes = {
  login: '/iniciar-sesion',
  register: '/registro',
  wishlist: '/lista-de-deseos',
  checkout: '/finalizar-compra',
  admin: {
    home: '/admin',
    products: '/admin/productos',
    newProduct: '/admin/productos/nuevo',
    promotions: '/admin/promociones',
    newPromotion: '/admin/promociones/nueva',
    coupons: '/admin/cupones',
    newCoupon: '/admin/cupones/nuevo',
    giftCards: '/admin/tarjetas-de-regalo',
    audit: '/admin/auditoria',
    sales: '/admin/ventas',
    reviews: '/admin/resenas',
    users: '/admin/usuarios',
  },
} as const

const routeAliases = [
  ['/admin/products/new', uiRoutes.admin.newProduct],
  ['/admin/promotions/new', uiRoutes.admin.newPromotion],
  ['/admin/coupons/new', uiRoutes.admin.newCoupon],
  ['/admin/products', uiRoutes.admin.products],
  ['/admin/promotions', uiRoutes.admin.promotions],
  ['/admin/coupons', uiRoutes.admin.coupons],
  ['/admin/gift-cards', uiRoutes.admin.giftCards],
  ['/admin/audit', uiRoutes.admin.audit],
  ['/admin/sales', uiRoutes.admin.sales],
  ['/admin/reviews', uiRoutes.admin.reviews],
  ['/admin/users', uiRoutes.admin.users],
  ['/login', uiRoutes.login],
  ['/register', uiRoutes.register],
  ['/wishlist', uiRoutes.wishlist],
  ['/checkout', uiRoutes.checkout],
] as const

export function canonicalizeUiPath(value: string): string {
  const suffixIndex = value.search(/[?#]/)
  const pathname = suffixIndex < 0 ? value : value.slice(0, suffixIndex)
  const suffix = suffixIndex < 0 ? '' : value.slice(suffixIndex)

  if (!pathname.startsWith('/') || pathname.startsWith('//')) return value

  for (const [legacyPath, canonicalPath] of routeAliases) {
    if (pathname === legacyPath || pathname.startsWith(`${legacyPath}/`)) {
      return `${canonicalPath}${pathname.slice(legacyPath.length)}${suffix}`
    }
  }

  return value
}
