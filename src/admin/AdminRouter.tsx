import type { ReactNode } from 'react'
import type { components } from '../types/generated/bff-api'
import './admin.css'
import ProductsList from './products/ProductsList'
import ProductForm from './products/ProductForm'
import PromotionsPanel from './promotions/PromotionsPanel'
import GiftCardForm from './giftcards/GiftCardForm'
import CouponsPanel from './coupons/CouponsPanel'
import AuditPanel from './audit/AuditPanel'
import SalesPanel from './sales/SalesPanel'
import ReviewsPanel from './reviews/ReviewsPanel'
import UserManagementPanel from './users/UserManagementPanel'
import { canonicalizeUiPath, uiRoutes } from '../routing/routes'

type AdminCapabilities = components['schemas']['CurrentUserCapabilities']

type AdminRoute = {
  href: string
  label: string
  usersOnly?: boolean
}

const adminRoutes: AdminRoute[] = [
  { href: uiRoutes.admin.products, label: 'Productos' },
  { href: uiRoutes.admin.promotions, label: 'Promociones' },
  { href: uiRoutes.admin.coupons, label: 'Cupones' },
  { href: uiRoutes.admin.giftCards, label: 'Gift cards' },
  { href: uiRoutes.admin.audit, label: 'Historial de auditoría' },
  { href: uiRoutes.admin.sales, label: 'Ventas' },
  { href: uiRoutes.admin.reviews, label: 'Reseñas' },
  { href: uiRoutes.admin.users, label: 'Usuarios', usersOnly: true },
]

function isUsersRoute(pathname: string) {
  return pathname === uiRoutes.admin.users || pathname.startsWith(`${uiRoutes.admin.users}/`)
}

function activeForPath(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`)
}

function AdminHome({ routes }: { routes: AdminRoute[] }) {
  return (
    <main className="admin-home">
      <p className="admin-eyebrow">Herramientas de operación</p>
      <h1>Administración</h1>
      <p>Elegí una sección para continuar con las tareas de la tienda.</p>
      <ul className="admin-home-links">
        {routes.map((route) => (
          <li key={route.href}>
            <a href={route.href}>{route.label}<span aria-hidden="true"> →</span></a>
          </li>
        ))}
      </ul>
    </main>
  )
}

function AdminRouter({
  path,
  capabilities,
  onNavigate,
}: {
  path?: string
  capabilities: AdminCapabilities
  onNavigate: (path: string) => void
}) {
  const pathname = canonicalizeUiPath(path ?? window.location.pathname)
  const routes = adminRoutes.filter((route) => !route.usersOnly || capabilities.is_superuser)
  let panel: ReactNode

  if (isUsersRoute(pathname) && !capabilities.is_superuser) {
    panel = (
      <main className="admin-forbidden">
        <h1>Acceso restringido</h1>
        <p>Solo una cuenta Superadmin puede administrar usuarios.</p>
      </main>
    )
  } else if (pathname === uiRoutes.admin.home) {
    panel = <AdminHome routes={routes} />
  } else if (pathname === uiRoutes.admin.giftCards || pathname.startsWith(`${uiRoutes.admin.giftCards}/`)) {
    panel = <GiftCardForm />
  } else if (pathname === uiRoutes.admin.coupons || new RegExp(`^${uiRoutes.admin.coupons}/(?:nuevo|\\d+)$`).test(pathname)) {
    panel = <CouponsPanel pathname={pathname} />
  } else if (pathname === uiRoutes.admin.audit) {
    panel = <AuditPanel />
  } else if (pathname === uiRoutes.admin.sales) {
    panel = <SalesPanel />
  } else if (pathname === uiRoutes.admin.reviews) {
    panel = <ReviewsPanel />
  } else if (isUsersRoute(pathname)) {
    panel = <UserManagementPanel />
  } else if (pathname === uiRoutes.admin.newProduct || pathname.startsWith(`${uiRoutes.admin.newProduct}/`)) {
    panel = <ProductForm pathname={pathname} />
  } else if (new RegExp(`^${uiRoutes.admin.products}/\\d+(?:/|$)`).test(pathname)) {
    panel = <ProductForm pathname={pathname} />
  } else if (pathname === uiRoutes.admin.products || pathname.startsWith(`${uiRoutes.admin.products}/`)) {
    panel = <ProductsList />
  } else if (new RegExp(`^${uiRoutes.admin.promotions}/(?:nueva|[^/]+)(?:/|$)`).test(pathname)
    || pathname === uiRoutes.admin.promotions || pathname.startsWith(`${uiRoutes.admin.promotions}/`)) {
    panel = <PromotionsPanel pathname={pathname} />
  } else {
    panel = (
      <main className="admin-not-found">
        <h1>No encontramos esta sección</h1>
        <p>La dirección de administración no corresponde a una sección disponible.</p>
        <a href={uiRoutes.admin.home} onClick={(event) => { event.preventDefault(); onNavigate(uiRoutes.admin.home) }}>Volver a administración</a>
      </main>
    )
  }

  return (
    <div className="admin-shell">
      <header className="admin-header">
        <a className="admin-brand" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/') }}>
          <span className="admin-brand-mark" aria-hidden="true">M</span>
          Meeple <span className="admin-brand-caption">/ Administración</span>
        </a>
        <a className="admin-store-link" href="/" onClick={(event) => { event.preventDefault(); onNavigate('/') }}>Volver a la tienda</a>
      </header>
      <div className="admin-layout">
        <nav className="admin-navigation" aria-label="Navegación de administración">
          <a
            className="admin-nav-home"
            href={uiRoutes.admin.home}
            aria-current={pathname === uiRoutes.admin.home ? 'page' : undefined}
            onClick={(event) => { event.preventDefault(); onNavigate(uiRoutes.admin.home) }}
          >
            Inicio de administración
          </a>
          <ul>
            {routes.map((route) => {
              const isCurrent = activeForPath(pathname, route.href)
              return (
                <li key={route.href}>
                  <a
                    href={route.href}
                    aria-current={isCurrent ? 'page' : undefined}
                    onClick={(event) => { event.preventDefault(); onNavigate(route.href) }}
                  >
                    {route.label}
                  </a>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="admin-content">{panel}</div>
      </div>
    </div>
  )
}

export default AdminRouter
