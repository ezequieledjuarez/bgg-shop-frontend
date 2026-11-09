import { useEffect, useState } from 'react'
import apiFetch from '../../lib/apiClient'
import type { components } from '../../types/generated/bff-api'
import CouponForm from './CouponForm'

type Coupon = components['schemas']['AdminCoupon']

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

function isCoupon(value: unknown): value is Coupon {
  if (typeof value !== 'object' || value === null) return false
  return 'id' in value
    && typeof value.id === 'number'
    && Number.isSafeInteger(value.id)
    && value.id > 0
    && 'code' in value
    && typeof value.code === 'string'
    && 'discount_percent' in value
    && typeof value.discount_percent === 'number'
    && value.discount_percent >= 0
    && value.discount_percent <= 50
    && 'remaining' in value
    && typeof value.remaining === 'number'
    && Number.isSafeInteger(value.remaining)
    && value.remaining >= 0
    && 'active' in value
    && typeof value.active === 'boolean'
    && 'starts_at' in value
    && (value.starts_at === null || (typeof value.starts_at === 'string' && Number.isFinite(Date.parse(value.starts_at))))
    && 'ends_at' in value
    && (value.ends_at === null || (typeof value.ends_at === 'string' && Number.isFinite(Date.parse(value.ends_at))))
    && 'created_at' in value
    && typeof value.created_at === 'string'
    && Number.isFinite(Date.parse(value.created_at))
}

function isCouponList(value: unknown): value is Coupon[] {
  return Array.isArray(value) && value.every(isCoupon)
}

function responseMessage(response: Response): string {
  if (response.status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.'
  if (response.status === 403) return 'No tenés permisos para administrar cupones.'
  return 'No se pudieron cargar los cupones.'
}

function formatDate(value: string | null): string {
  if (value === null) return 'Sin límite'
  return new Intl.DateTimeFormat('es-AR', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
}

export default function CouponsPanel() {
  const pathname = window.location.pathname
  const isForm = pathname === '/admin/coupons/new' || /^\/admin\/coupons\/\d+$/.test(pathname)
  const [coupons, setCoupons] = useState<Coupon[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isForm) return
    const controller = new AbortController()
    apiFetch(`${apiBaseUrl}/admin/coupons`, {
      signal: controller.signal,
      waitForTokenAttempts: 1,
      waitForTokenTimeout: 5000,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(responseMessage(response))
        const payload: unknown = await response.json()
        if (!isCouponList(payload)) throw new Error('La respuesta de cupones no es válida.')
        setCoupons(payload)
        setLoadState('success')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : 'No se pudieron cargar los cupones.')
        setLoadState('error')
      })
    return () => controller.abort()
  }, [isForm])

  if (isForm) return <CouponForm />

  return (
    <main className="admin-coupons">
      <h1>Cupones</h1>
      <p>Administrá descuentos para compras completas. Los códigos distinguen mayúsculas y minúsculas.</p>
      <a className="primary-button" href="/admin/coupons/new">Crear cupón</a>
      {loadState === 'loading' ? <p role="status">Cargando cupones...</p> : null}
      {loadState === 'error' ? <p role="alert">{error}</p> : null}
      {loadState === 'success' && coupons.length === 0 ? <p role="status">Todavía no hay cupones.</p> : null}
      {loadState === 'success' && coupons.length > 0 ? (
        <div className="admin-table-scroll" role="region" aria-label="Tabla de cupones, desplazamiento horizontal disponible" tabIndex={0}>
        <table className="admin-table" aria-label="Cupones">
          <thead>
            <tr>
              <th scope="col">Código</th>
              <th scope="col">Descuento</th>
              <th scope="col">Usos restantes</th>
              <th scope="col">Estado</th>
              <th scope="col">Válido desde</th>
              <th scope="col">Válido hasta</th>
              <th scope="col">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {coupons.map((coupon) => (
              <tr key={coupon.id}>
                <th scope="row">{coupon.code}</th>
                <td>{coupon.discount_percent}%</td>
                <td>{coupon.remaining}</td>
                <td>{coupon.active ? 'Activo' : 'Inactivo'}</td>
                <td>{formatDate(coupon.starts_at)}</td>
                <td>{formatDate(coupon.ends_at)}</td>
                <td><a href={`/admin/coupons/${coupon.id}`}>Editar / activar o desactivar</a></td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : null}
    </main>
  )
}
