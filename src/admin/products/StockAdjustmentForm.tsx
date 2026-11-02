import { useEffect, useRef, useState, type FormEvent } from 'react'
import apiFetch from '../../lib/apiClient'
import type { components } from '../../types/generated/bff-api'

type StockRequest = components['schemas']['AdminAdjustStockRequest']
type StockMovementId = components['schemas']['AdminStockMovementId']
type StockMovementStatus = components['schemas']['AdminStockMovementStatus']
type StockMovementResult = components['schemas']['AdminStockMovementResult']

type Feedback = {
  kind: 'error' | 'info' | 'success' | 'uncertain'
  text: string
}

type RestoredPending = {
  payload: StockRequest | null
  error: string | null
}

const STORAGE_VERSION = 1
const MAX_STOCK_MOVEMENT_QUANTITY = 2147483647

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isUuid(value: unknown): value is string {
  return typeof value === 'string'
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
}

function isStockRequest(value: unknown): value is StockRequest {
  return isRecord(value)
    && isUuid(value.movement_id)
    && (value.direction === 'IN' || value.direction === 'OUT')
    && Number.isSafeInteger(value.quantity)
    && Number(value.quantity) > 0
}

function isSameStockRequest(left: StockRequest, right: StockRequest): boolean {
  return left.movement_id === right.movement_id
    && left.direction === right.direction
    && left.quantity === right.quantity
}

function isMovementId(value: unknown): value is StockMovementId {
  return isRecord(value) && isUuid(value.movement_id)
}

function isMovementStatus(value: unknown): value is StockMovementStatus {
  return isRecord(value)
    && isUuid(value.movement_id)
    && (value.status === 'IN_PROGRESS' || value.status === 'APPLIED' || value.status === 'REJECTED')
}

function isMovementResult(value: unknown): value is StockMovementResult {
  return isRecord(value)
    && isUuid(value.movement_id)
    && value.status === 'APPLIED'
    && Number.isSafeInteger(value.requested_quantity)
    && Number(value.requested_quantity) > 0
    && Number.isSafeInteger(value.applied_quantity)
    && Number(value.applied_quantity) >= 0
    && Number.isSafeInteger(value.quantity_before)
    && Number(value.quantity_before) >= 0
    && Number.isSafeInteger(value.quantity_after)
    && Number(value.quantity_after) >= 0
    && (value.warning === undefined || typeof value.warning === 'string')
}

function readPending(key: string): RestoredPending {
  try {
    const stored = window.localStorage.getItem(key)
    if (stored === null) return { payload: null, error: null }

    const parsed: unknown = JSON.parse(stored)
    if (
      isRecord(parsed)
      && parsed.version === STORAGE_VERSION
      && isStockRequest(parsed.payload)
    ) {
      return { payload: parsed.payload, error: null }
    }

    return {
      payload: null,
      error: 'No se pudo validar el ajuste guardado. No inicies otro movimiento hasta revisar el almacenamiento local.',
    }
  } catch {
    return {
      payload: null,
      error: 'No se pudo leer el ajuste guardado. No inicies otro movimiento hasta revisar el almacenamiento local.',
    }
  }
}

export default function StockAdjustmentForm({
  productId,
  onApplied,
}: {
  productId: number
  onApplied?: (quantity: number) => void
}) {
  const storageKey = `bgg-shop:stock-adjustment:v${STORAGE_VERSION}:${productId}`
  const [restored] = useState(() => readPending(storageKey))
  const [pending, setPending] = useState<StockRequest | null>(restored.payload)
  const [storageError, setStorageError] = useState<string | null>(restored.error)
  const [direction, setDirection] = useState<StockRequest['direction']>('IN')
  const [quantity, setQuantity] = useState('')
  const [validationError, setValidationError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(
    restored.payload
      ? { kind: 'uncertain', text: 'Hay un ajuste pendiente. Consultá su estado o reintentá explícitamente el mismo movimiento.' }
      : null,
  )
  const [status, setStatus] = useState<StockMovementStatus | null>(null)
  const [result, setResult] = useState<StockMovementResult | null>(null)
  const [busyAction, setBusyAction] = useState<'starting' | 'retrying' | 'checking' | null>(null)
  const busyRef = useRef(false)
  const mountedRef = useRef(false)
  const controllerRef = useRef<AbortController | null>(null)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
      controllerRef.current?.abort()
    }
  }, [])

  function setPendingOnDisk(payload: StockRequest): boolean {
    try {
      const existing = readPending(storageKey)
      if (existing.payload || existing.error) {
        if (existing.payload) {
          setPending(existing.payload)
          setStatus(null)
          setStorageError(null)
          setFeedback({
            kind: 'uncertain',
            text: 'Ya existe un ajuste pendiente para este producto. Consultá su estado o reintentá ese mismo movimiento.',
          })
        } else {
          setStorageError(existing.error)
          setFeedback({ kind: 'error', text: existing.error })
        }
        return false
      }

      window.localStorage.setItem(storageKey, JSON.stringify({
        version: STORAGE_VERSION,
        payload,
      }))
      const saved = readPending(storageKey)
      if (!saved.payload || !isSameStockRequest(saved.payload, payload)) {
        if (saved.payload) {
          setPending(saved.payload)
          setFeedback({
            kind: 'uncertain',
            text: 'Otra pestaña guardó un ajuste para este producto. Se conservó su identificador y no se envió un movimiento nuevo.',
          })
        } else {
          setStorageError(saved.error ?? 'No se pudo validar el ajuste guardado.')
          setFeedback({
            kind: 'error',
            text: 'No se pudo verificar el ajuste guardado; no se envió el cambio de inventario.',
          })
        }
        return false
      }
      setPending(payload)
      setStorageError(null)
      return true
    } catch {
      setFeedback({
        kind: 'error',
        text: 'No se pudo guardar el ajuste pendiente; no se envió el cambio de inventario.',
      })
      return false
    }
  }

  function finishAppliedMovement(applied: StockMovementResult): void {
    setResult(applied)
    onApplied?.(applied.quantity_after)
    setStatus(null)
    try {
      window.localStorage.removeItem(storageKey)
      setPending(null)
      setStorageError(null)
      setFeedback({ kind: 'success', text: 'El ajuste fue aplicado y confirmado por el servidor.' })
    } catch {
      setFeedback({
        kind: 'success',
        text: 'El servidor confirmó el ajuste, pero no se pudo limpiar el respaldo local.',
      })
    }
  }

  async function performPost(payload: StockRequest, signal: AbortSignal): Promise<void> {
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
    const response = await apiFetch(`${base}/admin/products/${productId}/stock`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal,
    })
    if (signal.aborted || !mountedRef.current) return

    if (response.status === 200) {
      const body: unknown = await response.json()
      if (signal.aborted || !mountedRef.current) return
      if (isMovementResult(body) && body.movement_id === payload.movement_id) {
        finishAppliedMovement(body)
        return
      }
      setFeedback({
        kind: 'uncertain',
        text: 'La respuesta no permitió confirmar las cantidades. Conservamos el ajuste para consultar su estado o recuperar el resultado.',
      })
      return
    }

    if (response.status === 202) {
      const body: unknown = await response.json()
      if (signal.aborted || !mountedRef.current) return
      if (isMovementStatus(body) && body.movement_id === payload.movement_id) {
        setStatus(body)
      }
    }
    setFeedback({
      kind: 'uncertain',
      text: 'No se pudo confirmar el resultado. El movimiento puede haberse aplicado; el UUID y el ajuste exacto siguen guardados.',
    })
  }

  async function runAction(
    action: 'starting' | 'retrying' | 'checking',
    work: (signal: AbortSignal) => Promise<void>,
  ): Promise<void> {
    if (busyRef.current) return
    busyRef.current = true
    const controller = new AbortController()
    controllerRef.current = controller
    setBusyAction(action)
    try {
      await work(controller.signal)
    } catch {
      if (!controller.signal.aborted && mountedRef.current) {
        setFeedback({
          kind: 'uncertain',
          text: 'No se pudo confirmar el resultado. El movimiento puede haberse aplicado; el UUID y el ajuste exacto siguen guardados.',
        })
      }
    } finally {
      if (controllerRef.current === controller) controllerRef.current = null
      if (mountedRef.current) setBusyAction(null)
      busyRef.current = false
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    const stored = readPending(storageKey)
    if (stored.payload || stored.error) {
      if (stored.payload) {
        setPending(stored.payload)
        setStorageError(null)
        setFeedback({
          kind: 'uncertain',
          text: 'Ya existe un ajuste pendiente para este producto. Consultá su estado o reintentá ese mismo movimiento.',
        })
      } else {
        setStorageError(stored.error)
        setFeedback({ kind: 'error', text: stored.error })
      }
      return
    }

    const amount = Number(quantity)
    if (
      !/^[1-9]\d*$/.test(quantity)
      || !Number.isSafeInteger(amount)
      || amount <= 0
      || amount > MAX_STOCK_MOVEMENT_QUANTITY
    ) {
      setValidationError(`La cantidad debe ser un entero positivo menor o igual a ${MAX_STOCK_MOVEMENT_QUANTITY}.`)
      return
    }
    setValidationError(null)
    setResult(null)
    setStatus(null)

    await runAction('starting', async (signal) => {
      const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
      let allocation: Response
      try {
        allocation = await apiFetch(`${base}/admin/stock-movement-ids`, {
          method: 'POST',
          signal,
        })
      } catch {
        if (!signal.aborted && mountedRef.current) {
          setFeedback({ kind: 'error', text: 'No se pudo preparar el movimiento; no se envió el ajuste de inventario.' })
        }
        return
      }

      if (signal.aborted || !mountedRef.current) return
      if (allocation.status !== 200) {
        setFeedback({ kind: 'error', text: 'No se pudo preparar el movimiento; no se envió el ajuste de inventario.' })
        return
      }

      let identity: unknown
      try {
        identity = await allocation.json()
      } catch {
        if (!signal.aborted && mountedRef.current) {
          setFeedback({ kind: 'error', text: 'La respuesta no permitió preparar el movimiento; no se envió el ajuste.' })
        }
        return
      }
      if (signal.aborted || !mountedRef.current) return
      if (!isMovementId(identity)) {
        setFeedback({ kind: 'error', text: 'La respuesta no incluyó un identificador válido; no se envió el ajuste.' })
        return
      }

      const payload: StockRequest = {
        movement_id: identity.movement_id,
        direction,
        quantity: amount,
      }
      if (!setPendingOnDisk(payload)) return
      setFeedback({
        kind: 'info',
        text: 'El ajuste está preparado y su identificador quedó guardado antes de enviarlo.',
      })
      await performPost(payload, signal)
    })
  }

  async function handleRetry(): Promise<void> {
    if (!pending) return
    setResult(null)
    await runAction('retrying', (signal) => performPost(pending, signal))
  }

  async function handleStatusLookup(): Promise<void> {
    if (!pending) return
    await runAction('checking', async (signal) => {
      const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
      const response = await apiFetch(`${base}/admin/stock-movements/${pending.movement_id}`, { signal })
      if (signal.aborted || !mountedRef.current) return
      if (response.status === 404) {
        setStatus(null)
        setFeedback({
          kind: 'uncertain',
          text: 'No se encontró el movimiento. La ausencia no confirma que se haya revertido; podés reintentar el mismo ajuste.',
        })
        return
      }
      if (response.status !== 200) {
        setFeedback({
          kind: 'uncertain',
          text: 'No se pudo consultar el estado. El resultado sigue sin confirmarse y el ajuste exacto permanece guardado.',
        })
        return
      }

      const body: unknown = await response.json()
      if (signal.aborted || !mountedRef.current) return
      if (!isMovementStatus(body) || body.movement_id !== pending.movement_id) {
        setFeedback({
          kind: 'uncertain',
          text: 'La respuesta de estado no coincide con el movimiento guardado; no se modificó el ajuste pendiente.',
        })
        return
      }

      setStatus(body)
      if (body.status === 'APPLIED') {
        setFeedback({
          kind: 'info',
          text: 'El estado es APPLIED, pero la consulta no incluye cantidades. Recuperá el resultado con una repetición explícita.',
        })
      } else if (body.status === 'IN_PROGRESS') {
        setFeedback({
          kind: 'info',
          text: 'El movimiento sigue en proceso. Podés consultar de nuevo o reintentar exactamente el mismo ajuste.',
        })
      } else {
        setFeedback({
          kind: 'info',
          text: 'El estado es REJECTED. Si corresponde, reintentá explícitamente el mismo ajuste y el mismo UUID.',
        })
      }
    })
  }

  const pendingApplied = status?.status === 'APPLIED'

  return (
    <section aria-labelledby="stock-adjustment-title">
      <h2 id="stock-adjustment-title">Ajustar inventario</h2>
      {storageError && <p role="alert">{storageError}</p>}
      {validationError && <p id="stock-quantity-error" role="alert">{validationError}</p>}
      {feedback && (
        <p role={feedback.kind === 'error' || feedback.kind === 'uncertain' ? 'alert' : 'status'} aria-live="polite">
          {feedback.text}
        </p>
      )}
      {result && (
        <p role="status" aria-live="polite">
          Solicitadas: {result.requested_quantity}. Aplicadas: {result.applied_quantity}. Existencia final: {result.quantity_after}.
          {result.applied_quantity < result.requested_quantity && (
            <> El egreso fue parcial; el inventario quedó en {result.quantity_after}.</>
          )}
        </p>
      )}

      {pending ? (
        <div aria-labelledby="pending-stock-title">
          <h3 id="pending-stock-title">Ajuste pendiente</h3>
          <p>UUID: <code>{pending.movement_id}</code></p>
          <p>Movimiento: {pending.direction === 'IN' ? 'Entrada' : 'Salida'} de {pending.quantity} unidades.</p>
          <button type="button" onClick={handleStatusLookup} disabled={busyAction !== null}>
            {busyAction === 'checking' ? 'Consultando…' : 'Consultar estado'}
          </button>
          <button type="button" onClick={handleRetry} disabled={busyAction !== null}>
            {busyAction === 'retrying' ? 'Reintentando…' : pendingApplied ? 'Recuperar resultado' : 'Reintentar el mismo ajuste'}
          </button>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="stock-direction">Tipo de movimiento</label>
          <select
            id="stock-direction"
            value={direction}
            onChange={(event) => setDirection(event.target.value as StockRequest['direction'])}
            disabled={busyAction !== null || storageError !== null}
          >
            <option value="IN">Entrada (IN)</option>
            <option value="OUT">Salida (OUT)</option>
          </select>

          <label htmlFor="stock-quantity">Cantidad a ajustar</label>
          <input
            id="stock-quantity"
            type="number"
            min="1"
            max={MAX_STOCK_MOVEMENT_QUANTITY}
            step="1"
            value={quantity}
            onChange={(event) => setQuantity(event.target.value)}
            aria-invalid={validationError !== null}
            aria-describedby={validationError ? 'stock-quantity-error' : undefined}
            disabled={busyAction !== null || storageError !== null}
          />
          <button type="submit" disabled={busyAction !== null || storageError !== null}>
            {busyAction === 'starting' ? 'Preparando…' : 'Aplicar ajuste'}
          </button>
        </form>
      )}
    </section>
  )
}
