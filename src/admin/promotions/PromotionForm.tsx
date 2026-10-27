import React, { useEffect, useState } from 'react'
import apiFetch, { waitForToken } from '../../lib/apiClient'
import createAbortController from '../../lib/abort'

type FieldErrors = Record<string, string>

export default function PromotionForm() {
  const pathname = window.location.pathname
  const isNew = pathname.endsWith('/new')
  const editingMatch = pathname.match(/^\/admin\/promotions\/(\d+)/)
  const editingId = editingMatch ? Number(editingMatch[1]) : undefined

  const [name, setName] = useState('')
  const [discountType, setDiscountType] = useState<'percentage' | 'fixed'>('percentage')
  const [value, setValue] = useState('')
  const [stackable, setStackable] = useState(false)
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (!editingId) return
    const controller = createAbortController()
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
    ;(async () => {
      try {
        await waitForToken(5000)
        const res = await apiFetch(`${base}/admin/promotions/${editingId}`, { signal: controller.signal })
        if (!res.ok) throw new Error('No se pudo cargar la promoción')
        const payload = await res.json()
        setName(payload.name || '')
        setDiscountType(payload.discount_type || 'percentage')
        setValue(String(payload.value ?? ''))
        setStackable(Boolean(payload.stackable))
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setLoadError(err instanceof Error ? err.message : 'Error desconocido')
      }
    })()
    return () => controller.abort()
  }, [editingId])

  const validate = () => {
    const next: FieldErrors = {}
    if (!name.trim()) next.name = 'El nombre es obligatorio'
    const v = Number(value)
    if (!value || Number.isNaN(v) || v <= 0) next.value = 'Valor inválido'
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const handleServerErrors = async (response: Response) => {
    try {
      const payload = await response.json()
      if (payload && Array.isArray(payload.errors)) {
        const next: FieldErrors = {}
        for (const err of payload.errors) {
          if (err && err.field) next[err.field] = err.message || 'Error en el campo'
        }
        setErrors(next)
        return
      }
    } catch {
      // ignore
    }
    setErrors({ __global: 'Error de servidor' })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    setErrors({})
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
    try {
      // submission started
      // Normalize payload to BFF expected shape
      // BFF expects `discount_percent` and `active` for creation.
      const body: any = { name: name.trim(), active: true }
      if (discountType === 'percentage') {
        body.discount_percent = Number(value)
      } else {
        // For fixed-value promotions map to discount_percent as fallback (server-side may adjust)
        body.discount_percent = Number(value)
      }
      const url = editingId ? `${base}/admin/promotions/${editingId}` : `${base}/admin/promotions`
      const method = editingId ? 'PUT' : 'POST'
      await waitForToken(5000)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      const res = await apiFetch(url, { method, headers, body: JSON.stringify(body) })
      if (!res.ok) {
        await handleServerErrors(res)
        setSaving(false)
        return
      }
      window.location.href = '/admin/promotions'
    } catch (err) {
      setErrors({ __global: 'No se pudo conectar con el servicio' })
    } finally {
      setSaving(false)
    }
  }

  // Preview calculation: example base price input
  const [basePrice, setBasePrice] = useState('1000')
  const calcPreview = () => {
    const bp = Number(basePrice) || 0
    const v = Number(value) || 0
    if (discountType === 'percentage') return Math.max(0, bp * (1 - v / 100))
    return Math.max(0, bp - v)
  }

  return (
    <main className="admin-promotion-form">
      <h1>{editingId ? `Editar promoción ${editingId}` : isNew ? 'Crear promoción' : 'Promoción'}</h1>
      {loadError && <div role="alert">{loadError}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <label>Nombre
          <input value={name} onChange={(e) => setName(e.target.value)} />
          {errors.name && <p role="alert">{errors.name}</p>}
        </label>
        <label>Tipo
          <select value={discountType} onChange={(e) => setDiscountType(e.target.value as any)}>
            <option value="percentage">Porcentaje</option>
            <option value="fixed">Valor fijo</option>
          </select>
        </label>
        <label>Valor
          <input value={value} onChange={(e) => setValue(e.target.value)} />
          {errors.value && <p role="alert">{errors.value}</p>}
        </label>
        <label>
          <input type="checkbox" checked={stackable} onChange={(e) => setStackable(e.target.checked)} /> Stackable
        </label>
        {errors.__global && <p role="alert">{errors.__global}</p>}
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </form>

      <section aria-labelledby="preview-title">
        <h2 id="preview-title">Preview de promoción</h2>
        <label>Precio base de ejemplo
          <input value={basePrice} onChange={(e) => setBasePrice(e.target.value)} />
        </label>
        <p>Precio con promoción: <strong>{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(calcPreview())}</strong></p>
        <p>{stackable ? 'Esta promoción se puede apilar con otras.' : 'Esta promoción no es stackable.'}</p>
      </section>
    </main>
  )
}
