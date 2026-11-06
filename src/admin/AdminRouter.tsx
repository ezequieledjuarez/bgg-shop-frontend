import ProductsList from './products/ProductsList'
import ProductForm from './products/ProductForm'
import PromotionsPanel from './promotions/PromotionsPanel'
import GiftCardForm from './giftcards/GiftCardForm'
import CouponsPanel from './coupons/CouponsPanel'
import AuditPanel from './audit/AuditPanel'
import SalesPanel from './sales/SalesPanel'
import ReviewsPanel from './reviews/ReviewsPanel'
import UserManagementPanel from './users/UserManagementPanel'

export default function AdminRouter({ path }: { path?: string }) {
  const pathname = path ?? window.location.pathname
  if (pathname === '/admin/gift-cards') return <GiftCardForm />
  if (pathname === '/admin/coupons' || /^\/admin\/coupons\/(?:new|\d+)$/.test(pathname)) return <CouponsPanel />
  if (pathname === '/admin/audit') return <AuditPanel />
  if (pathname === '/admin/sales') return <SalesPanel />
  if (pathname === '/admin/reviews') return <ReviewsPanel />
  if (pathname === '/admin/users') return <UserManagementPanel />
  // /admin/products/new -> new form
  if (pathname.startsWith('/admin/products/new')) return <ProductForm />
  // /admin/products/:id -> edit form
  if (/^\/admin\/products\/\d+/.test(pathname)) return <ProductForm />
  if (pathname.startsWith('/admin/products')) return <ProductsList />
  // /admin/promotions/new or /admin/promotions/:id -> edit/create
  if (/^\/admin\/promotions\/(new|\d+)/.test(pathname)) return <PromotionsPanel />
  if (pathname.startsWith('/admin/promotions')) return <PromotionsPanel />
  return (
    <main>
      <h1>Admin</h1>
      <nav aria-label="Administración">
        <a href="/admin/products">Productos</a> | <a href="/admin/promotions">Promociones</a> | <a href="/admin/coupons">Cupones</a> | <a href="/admin/gift-cards">Gift cards</a> | <a href="/admin/audit">Historial de auditoría</a> | <a href="/admin/sales">Ventas</a> | <a href="/admin/reviews">Reseñas</a> | <a href="/admin/users">Usuarios</a>
      </nav>
    </main>
  )
}
