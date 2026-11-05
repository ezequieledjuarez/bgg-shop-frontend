import { useEffect, useRef, useState } from 'react'
import apiFetch from '../../lib/apiClient'
import type { components } from '../../types/generated/bff-api'

type AdminReview = components['schemas']['AdminReview']
type AdminReviewPage = components['schemas']['AdminReviewPage']
type ReviewStatus = components['schemas']['ReviewModerationStatus']
type ModerateReviewRequest = components['schemas']['ModerateReviewRequest']
type ModerateReviewResponse = components['schemas']['ModerateReviewResponse']

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isReviewStatus(value: unknown): value is ReviewStatus {
  return value === 'PENDING' || value === 'ACCEPTED' || value === 'REJECTED'
}

function isAdminReview(value: unknown): value is AdminReview {
  return isRecord(value)
    && typeof value.review_id === 'number'
    && Number.isSafeInteger(value.review_id)
    && value.review_id > 0
    && typeof value.game_bgg_id === 'number'
    && Number.isSafeInteger(value.game_bgg_id)
    && value.game_bgg_id > 0
    && typeof value.game_name === 'string'
    && typeof value.rating === 'number'
    && Number.isInteger(value.rating)
    && value.rating >= 1
    && value.rating <= 5
    && typeof value.body === 'string'
    && typeof value.created_at === 'string'
    && Number.isFinite(Date.parse(value.created_at))
    && isReviewStatus(value.status)
}

function isAdminReviewPage(value: unknown): value is AdminReviewPage {
  return isRecord(value)
    && Array.isArray(value.items)
    && value.items.every(isAdminReview)
    && typeof value.page === 'number'
    && Number.isSafeInteger(value.page)
    && typeof value.page_size === 'number'
    && Number.isSafeInteger(value.page_size)
    && typeof value.total === 'number'
    && Number.isSafeInteger(value.total)
    && typeof value.total_pages === 'number'
    && Number.isSafeInteger(value.total_pages)
}

function isModerateReviewResponse(value: unknown): value is ModerateReviewResponse {
  return isRecord(value)
    && typeof value.review_id === 'number'
    && Number.isSafeInteger(value.review_id)
    && isReviewStatus(value.status)
    && typeof value.deleted === 'boolean'
    && typeof value.publicly_visible === 'boolean'
    && typeof value.cache_refresh_pending === 'boolean'
}

function queueErrorMessage(status: number): string {
  if (status === 401) return 'Tu sesión no está autenticada o expiró. Iniciá sesión nuevamente.'
  if (status === 403) return 'No tenés permisos para consultar las reseñas.'
  if (status === 502) return 'La cola de reseñas no está disponible en este momento.'
  return 'No se pudieron cargar las reseñas. Intentá nuevamente.'
}

function actionErrorMessage(status: number): string {
  if (status === 401) return 'Tu sesión no está autenticada o expiró. Iniciá sesión nuevamente.'
  if (status === 403) return 'No tenés permisos para moderar reseñas.'
  if (status === 404) return 'La reseña ya no está disponible.'
  if (status === 409) return 'La reseña cambió de estado y no se pudo moderar.'
  if (status === 502) return 'No se pudo completar la moderación en este momento.'
  return 'No se pudo completar la moderación. Intentá nuevamente.'
}

function statusLabel(status: ReviewStatus): string {
  if (status === 'PENDING') return 'Pendiente'
  if (status === 'ACCEPTED') return 'Aceptada'
  return 'Rechazada'
}

function formatCreatedAt(value: string): string {
  return new Intl.DateTimeFormat('es-AR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value))
}

export default function ReviewsPanel() {
  const [reviews, setReviews] = useState<AdminReview[]>([])
  const [total, setTotal] = useState(0)
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>('loading')
  const [loadError, setLoadError] = useState('')
  const [actionError, setActionError] = useState('')
  const [actionNotice, setActionNotice] = useState('')
  const [actionInProgress, setActionInProgress] = useState(false)
  const [refreshCount, setRefreshCount] = useState(0)
  const actionController = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoadState('loading')
    setLoadError('')

    void (async () => {
      try {
        const response = await apiFetch(`${apiBaseUrl}/admin/reviews`, {
          signal: controller.signal,
          waitForTokenAttempts: 1,
          waitForTokenTimeout: 5000,
        })
        if (controller.signal.aborted) return
        if (!response.ok) {
          setLoadError(queueErrorMessage(response.status))
          setLoadState('error')
          return
        }

        const payload: unknown = await response.json()
        if (controller.signal.aborted) return
        if (!isAdminReviewPage(payload)) {
          setLoadError('La respuesta de la cola de reseñas no tiene un formato válido.')
          setLoadState('error')
          return
        }
        setReviews(payload.items)
        setTotal(payload.total)
        setLoadState('success')
      } catch (error: unknown) {
        if (controller.signal.aborted) return
        const authenticationUnavailable = error instanceof Error
          && error.message === 'Authentication token not available after retries'
        setLoadError(authenticationUnavailable
          ? queueErrorMessage(401)
          : queueErrorMessage(0))
        setLoadState('error')
      }
    })()

    return () => controller.abort()
  }, [refreshCount])

  useEffect(() => () => actionController.current?.abort(), [])

  async function moderateReview(
    reviewId: number,
    action: ModerateReviewRequest['action'],
  ) {
    actionController.current?.abort()
    const controller = new AbortController()
    actionController.current = controller
    setActionInProgress(true)
    setActionError('')
    setActionNotice('')

    try {
      const request: ModerateReviewRequest = { action }
      const response = await apiFetch(`${apiBaseUrl}/admin/reviews/${reviewId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
        signal: controller.signal,
        waitForTokenAttempts: 1,
        waitForTokenTimeout: 5000,
      })
      if (!response.ok) {
        setActionError(actionErrorMessage(response.status))
        return
      }

      const payload: unknown = await response.json()
      if (!isModerateReviewResponse(payload)) {
        setActionError('La respuesta de moderación no tiene un formato válido.')
        return
      }

      setActionNotice(payload.cache_refresh_pending
        ? 'La acción se completó, pero la actualización de la vista pública está pendiente.'
        : 'La moderación se completó correctamente.')
      setRefreshCount((count) => count + 1)
    } catch (error: unknown) {
      if (controller.signal.aborted) return
      const authenticationUnavailable = error instanceof Error
        && error.message === 'Authentication token not available after retries'
      setActionError(authenticationUnavailable
        ? actionErrorMessage(401)
        : actionErrorMessage(0))
    } finally {
      if (!controller.signal.aborted) setActionInProgress(false)
    }
  }

  return (
    <main>
      <h1>Moderación de reseñas</h1>
      <p>Revisá la cola y decidí qué reseñas publicar o rechazar.</p>

      {actionNotice && <p role="status">{actionNotice}</p>}
      {actionError && <p role="alert">{actionError}</p>}

      {loadState === 'loading' && <p role="status">Cargando reseñas...</p>}
      {loadState === 'error' && (
        <div>
          <p role="alert">{loadError}</p>
          <button type="button" onClick={() => setRefreshCount((count) => count + 1)}>
            Reintentar
          </button>
        </div>
      )}
      {loadState === 'success' && reviews.length === 0 && (
        <p role="status">No hay reseñas para moderar.</p>
      )}
      {loadState === 'success' && reviews.length > 0 && (
        <section aria-label="Cola de reseñas">
          <p>{total} {total === 1 ? 'reseña' : 'reseñas'} en la cola.</p>
          <ul>
            {reviews.map((review) => (
              <li key={review.review_id}>
                <article aria-labelledby={`review-${review.review_id}-game`}>
                  <h2 id={`review-${review.review_id}-game`}>{review.game_name}</h2>
                  <p>Juego BGG #{review.game_bgg_id}</p>
                  <p>{review.rating}/5</p>
                  <p>{review.body}</p>
                  <p>Estado: {statusLabel(review.status)}</p>
                  <p>Enviada el {formatCreatedAt(review.created_at)}</p>
                  {review.status !== 'REJECTED' && (
                    <button
                      type="button"
                      onClick={() => void moderateReview(review.review_id, 'REJECT')}
                      disabled={actionInProgress}
                    >
                      {actionInProgress ? 'Procesando...' : 'Rechazar reseña'}
                    </button>
                  )}
                  {review.status !== 'ACCEPTED' && (
                    <button
                      type="button"
                      onClick={() => void moderateReview(review.review_id, 'ACCEPT')}
                      disabled={actionInProgress}
                    >
                      {actionInProgress ? 'Procesando...' : 'Aceptar reseña'}
                    </button>
                  )}
                </article>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  )
}
