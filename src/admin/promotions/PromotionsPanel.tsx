import { useEffect, useState } from 'react'
import apiFetch from '../../lib/apiClient'
import type { components } from '../../types/generated/bff-api'
import PromotionForm from './PromotionForm'

type Promotion = components['schemas']['AdminPromotion']

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

function isPromotion(value: unknown): value is Promotion {
  if (typeof value !== 'object' || value === null || !('id' in value) || typeof value.id !== 'string') return false
  return 'name' in value
    && typeof value.name === 'string'
    && 'discount_percent' in value
    && typeof value.discount_percent === 'number'
    && 'active' in value
    && typeof value.active === 'boolean'
    && (!('product_bgg_id' in value) || value.product_bgg_id === null || typeof value.product_bgg_id === 'number')
}

function isPromotionList(value: unknown): value is Promotion[] {
  return Array.isArray(value) && value.every(isPromotion)
}

function responseMessage(response: Response): string {
  if (response.status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.'
  if (response.status === 403) return 'No tenés permisos para administrar promociones.'
  return 'No se pudieron cargar las promociones.'
}

export default function PromotionsPanel() {
  const pathname = window.location.pathname
  const routeId = pathname.match(/^\/admin\/promotions\/([^/]+)$/)?.[1]
  const isForm = Boolean(routeId)

  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>('loading')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isForm) return
    const controller = new AbortController()
    apiFetch(`${apiBaseUrl}/admin/promotions`, {
      signal: controller.signal,
      waitForTokenAttempts: 1,
      waitForTokenTimeout: 5000,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(responseMessage(response))
        const payload: unknown = await response.json()
        if (!isPromotionList(payload)) throw new Error('La respuesta de promociones no es válida.')
        setPromotions(payload)
        setLoadState('success')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setError(reason instanceof Error ? reason.message : 'No se pudieron cargar las promociones.')
        setLoadState('error')
      })
    return () => controller.abort()
  }, [isForm])

  if (isForm) return <PromotionForm />

  return (
    <main className="admin-promotions">
      <h1>Promociones</h1>
      <p>Administrá descuentos porcentuales asociados a productos.</p>
      <a className="primary-button" href="/admin/promotions/new">Crear promoción</a>
      {loadState === 'loading' ? <p role="status">Cargando promociones...</p> : null}
      {loadState === 'error' ? <p role="alert">{error}</p> : null}
      {loadState === 'success' && promotions.length === 0 ? (
        <p role="status">Todavía no hay promociones.</p>
      ) : null}
      {loadState === 'success' && promotions.length > 0 ? (
        <ul>
          {promotions.map((promotion) => (
            <li key={promotion.id}>
              <strong>{promotion.name}</strong>
              {' — '}
              {promotion.discount_percent}% de descuento
              {' · '}
              {promotion.product_bgg_id == null ? 'Todos los productos' : `Producto #${promotion.product_bgg_id}`}
              {' · '}
              {promotion.active ? 'Activa' : 'Inactiva'}
              {' '}
              <a href={`/admin/promotions/${encodeURIComponent(promotion.id)}`}>Editar</a>
            </li>
          ))}
        </ul>
      ) : null}
    </main>
  )
}
