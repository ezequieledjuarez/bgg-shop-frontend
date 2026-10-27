import React from 'react'

import ProductsList from './products/ProductsList'
import ProductForm from './products/ProductForm'
import PromotionsPanel from './promotions/PromotionsPanel'

export default function AdminRouter({ path }: { path?: string }) {
  const pathname = path ?? window.location.pathname
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
      <nav>
        <a href="/admin/products">Productos</a> | <a href="/admin/promotions">Promociones</a>
      </nav>
    </main>
  )
}
