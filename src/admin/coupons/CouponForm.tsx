import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import apiFetch from '../../lib/apiClient'
import type { components, operations } from '../../types/generated/bff-api'

type Coupon = components['schemas']['AdminCoupon']
type CreateCouponOperationRequest = operations['adminCreateCoupon']['requestBody']['content']['application/json']
type CreateCouponRequest = Required<Pick<CreateCouponOperationRequest, 'code' | 'discount_percent' | 'remaining' | 'active'>>
  & Pick<CreateCouponOperationRequest, 'starts_at' | 'ends_at'>
type UpdateCouponRequest = operations['adminUpdateCoupon']['requestBody']['content']['application/json']
type FieldErrors = Record<string, string>

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

function responseMessage(response: Response, fallback: string): string {
  if (response.status === 401) return 'Tu sesión expiró. Iniciá sesión nuevamente.'
  if (response.status === 403) return 'No tenés permisos para administrar cupones.'
  if (response.status === 404) return 'No encontramos el cupón solicitado.'
  if (response.status === 409) return 'Ya existe un cupón con ese código.'
  return fallback
}

function readFieldErrors(value: unknown): FieldErrors {
  if (typeof value !== 'object' || value === null || !('errors' in value) || !Array.isArray(value.errors)) return {}
  const errors: FieldErrors = {}
  for (const item of value.errors) {
    if (typeof item !== 'object' || item === null || !('field' in item) || typeof item.field !== 'string') continue
    if ('message' in item && typeof item.message === 'string') errors[item.field] = item.message
  }
  return errors
}

function toDateTimeLocal(value: string | null): string {
  if (value === null) return ''
  const date = new Date(value)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

function toIsoOrNull(value: string): string | null {
  return value === '' ? null : new Date(value).toISOString()
}

function sameDate(left: string | null, right: string | null): boolean {
  if (left === null || right === null) return left === right
  return Date.parse(left) === Date.parse(right)
}

export default function CouponForm() {
  const pathname = window.location.pathname
  const routeId = pathname.match(/^\/admin\/coupons\/(\d+)$/)?.[1]
  const editingId = routeId ? Number(routeId) : undefined
  const isEditing = editingId !== undefined

  const [code, setCode] = useState('')
  const [discountPercent, setDiscountPercent] = useState('')
  const [remaining, setRemaining] = useState('')
  const [active, setActive] = useState(false)
  const [startsAt, setStartsAt] = useState('')
  const [endsAt, setEndsAt] = useState('')
  const [original, setOriginal] = useState<Coupon | null>(null)
  const [loadState, setLoadState] = useState<'loading' | 'error' | 'success'>(isEditing ? 'loading' : 'success')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!isEditing) return
    const controller = new AbortController()
    apiFetch(`${apiBaseUrl}/admin/coupons`, {
      signal: controller.signal,
      waitForTokenAttempts: 1,
      waitForTokenTimeout: 5000,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error(responseMessage(response, 'No se pudieron cargar los cupones.'))
        const payload: unknown = await response.json()
        if (!isCouponList(payload)) throw new Error('La respuesta de cupones no es válida.')
        const coupon = payload.find((item) => item.id === editingId)
        if (!coupon) throw new Error('No encontramos el cupón solicitado.')
        setOriginal(coupon)
        setCode(coupon.code)
        setDiscountPercent(String(coupon.discount_percent))
        setRemaining(String(coupon.remaining))
        setActive(coupon.active)
        setStartsAt(toDateTimeLocal(coupon.starts_at))
        setEndsAt(toDateTimeLocal(coupon.ends_at))
        setLoadState('success')
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return
        setLoadError(reason instanceof Error ? reason.message : 'No se pudieron cargar los datos del cupón.')
        setLoadState('error')
      })
    return () => controller.abort()
  }, [editingId, isEditing])

  const validate = (): boolean => {
    const next: FieldErrors = {}
    const percent = Number(discountPercent)
    const uses = Number(remaining)
    if (!code) next.code = 'El código es obligatorio.'
    if (discountPercent === '' || !Number.isFinite(percent) || percent < 0 || percent > 50) {
      next.discount_percent = 'El descuento debe estar entre 0% y 50%, inclusive.'
    }
    if (remaining === '' || !Number.isSafeInteger(uses) || uses < 0) {
      next.remaining = 'Los usos restantes deben ser un número entero igual o mayor que cero.'
    }

    const startTime = startsAt === '' ? null : Date.parse(startsAt)
    const endTime = endsAt === '' ? null : Date.parse(endsAt)
    if (startsAt !== '' && !Number.isFinite(startTime)) next.starts_at = 'Ingresá una fecha de inicio válida.'
    if (endsAt !== '' && !Number.isFinite(endTime)) next.ends_at = 'Ingresá una fecha de fin válida.'
    if (startTime !== null && endTime !== null && Number.isFinite(startTime) && Number.isFinite(endTime) && startTime >= endTime) {
      next.ends_at = 'La fecha de inicio debe ser anterior a la fecha de fin.'
    }

    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setGlobalError(null)
    setSaved(false)
    if (!validate()) return

    const percent = Number(discountPercent)
    const uses = Number(remaining)
    const normalizedStart = toIsoOrNull(startsAt)
    const normalizedEnd = toIsoOrNull(endsAt)
    let body: CreateCouponRequest | UpdateCouponRequest

    if (isEditing && original) {
      const changes: UpdateCouponRequest = {}
      if (percent !== original.discount_percent) changes.discount_percent = percent
      if (uses !== original.remaining) changes.remaining = uses
      if (active !== original.active) changes.active = active
      if (!sameDate(normalizedStart, original.starts_at)) changes.starts_at = normalizedStart
      if (!sameDate(normalizedEnd, original.ends_at)) changes.ends_at = normalizedEnd
      if (Object.keys(changes).length === 0) {
        setGlobalError('No hay cambios para guardar.')
        return
      }
      body = changes
    } else {
      body = {
        code,
        discount_percent: percent,
        remaining: uses,
        active,
        starts_at: normalizedStart,
        ends_at: normalizedEnd,
      }
    }

    setSaving(true)
    setErrors({})
    try {
      const response = await apiFetch(
        isEditing ? `${apiBaseUrl}/admin/coupons/${editingId}` : `${apiBaseUrl}/admin/coupons`,
        {
          method: isEditing ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          waitForTokenAttempts: 1,
          waitForTokenTimeout: 5000,
        },
      )
      if (!response.ok) {
        const responseBody: unknown = await response.json().catch(() => null)
        const serverErrors = readFieldErrors(responseBody)
        if (Object.keys(serverErrors).length > 0) setErrors(serverErrors)
        else setGlobalError(responseMessage(response, 'No se pudo guardar el cupón.'))
        return
      }
      const payload: unknown = await response.json()
      if (!isCoupon(payload)) {
        setGlobalError('La respuesta del servicio no contiene un cupón válido.')
        return
      }
      setSaved(true)
    } catch (reason: unknown) {
      setGlobalError(reason instanceof Error ? reason.message : 'No se pudo conectar con el servicio.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="admin-coupon-form">
      <h1>{isEditing ? `Editar cupón ${editingId}` : 'Crear cupón'}</h1>
      {loadState === 'loading' ? <p role="status">Cargando datos del cupón...</p> : null}
      {loadState === 'error' ? <p role="alert">{loadError}</p> : null}
      {loadState === 'success' ? (
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="coupon-code">Código</label>
          <input
            id="coupon-code"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            readOnly={isEditing}
            required
            aria-invalid={Boolean(errors.code)}
            aria-describedby={errors.code ? 'coupon-code-error' : undefined}
          />
          {errors.code ? <p id="coupon-code-error" role="alert">{errors.code}</p> : null}

          <label htmlFor="coupon-discount">Descuento (%)</label>
          <input
            id="coupon-discount"
            type="number"
            min="0"
            max="50"
            step="any"
            value={discountPercent}
            onChange={(event) => setDiscountPercent(event.target.value)}
            required
            aria-invalid={Boolean(errors.discount_percent)}
            aria-describedby={errors.discount_percent ? 'coupon-discount-error' : undefined}
          />
          {errors.discount_percent ? <p id="coupon-discount-error" role="alert">{errors.discount_percent}</p> : null}

          <label htmlFor="coupon-remaining">Usos restantes</label>
          <input
            id="coupon-remaining"
            type="number"
            min="0"
            step="1"
            value={remaining}
            onChange={(event) => setRemaining(event.target.value)}
            required
            aria-invalid={Boolean(errors.remaining)}
            aria-describedby={errors.remaining ? 'coupon-remaining-error' : undefined}
          />
          {errors.remaining ? <p id="coupon-remaining-error" role="alert">{errors.remaining}</p> : null}

          <label htmlFor="coupon-starts-at">Válido desde</label>
          <input
            id="coupon-starts-at"
            type="datetime-local"
            value={startsAt}
            onChange={(event) => setStartsAt(event.target.value)}
            aria-invalid={Boolean(errors.starts_at)}
            aria-describedby={errors.starts_at ? 'coupon-starts-at-error' : undefined}
          />
          {errors.starts_at ? <p id="coupon-starts-at-error" role="alert">{errors.starts_at}</p> : null}

          <label htmlFor="coupon-ends-at">Válido hasta</label>
          <input
            id="coupon-ends-at"
            type="datetime-local"
            value={endsAt}
            onChange={(event) => setEndsAt(event.target.value)}
            aria-invalid={Boolean(errors.ends_at)}
            aria-describedby={errors.ends_at ? 'coupon-ends-at-error' : undefined}
          />
          {errors.ends_at ? <p id="coupon-ends-at-error" role="alert">{errors.ends_at}</p> : null}

          <label htmlFor="coupon-active">
            <input id="coupon-active" type="checkbox" checked={active} onChange={(event) => setActive(event.target.checked)} />
            Activo
          </label>

          {globalError ? <p role="alert">{globalError}</p> : null}
          {saved ? <p role="status">El cupón se guardó correctamente.</p> : null}
          <button className="primary-button" type="submit" disabled={saving}>
            {saving ? 'Guardando…' : 'Guardar'}
          </button>
        </form>
      ) : null}
    </main>
  )
}
