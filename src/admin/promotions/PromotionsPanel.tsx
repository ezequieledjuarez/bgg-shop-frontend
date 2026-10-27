import { useEffect, useState } from 'react'
import apiFetch, { waitForToken } from '../../lib/apiClient'
import createAbortController from '../../lib/abort'
import PromotionForm from './PromotionForm'

type Promotion = {
  id: number
  name: string
  discount_type: 'percentage' | 'fixed'
  value: number
  stackable: boolean
}

export default function PromotionsPanel() {
  const pathname = window.location.pathname
  const editingMatch = pathname.match(/^\/admin\/promotions\/(new|\d+)/)
  const isForm = Boolean(editingMatch)

  const [promotions, setPromotions] = useState<Promotion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (isForm) return
    const controller = createAbortController()
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
    

    ;(async () => {
      try {
        await waitForToken(5000)
        // Debug: log presence of token used for promotions list fetch
        // eslint-disable-next-line no-console
        console.info('Admin promotions list token present')
        const res = await apiFetch(`${base}/admin/promotions?page=1&page_size=50`, { signal: controller.signal })
        if (!res.ok) throw new Error('No se pudo cargar promociones')
        const payload = (await res.json()) as { items: Promotion[] }
        setPromotions(payload.items || [])
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        try {
          // eslint-disable-next-line no-console
          console.error('[PromotionsPanel] fetch error', { url: `${base}/admin/promotions`, error: err })
        } catch (e) {
          // ignore
        }
        setError(err instanceof Error ? err.message : 'Error desconocido')
      } finally {
        setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [isForm])

  const handleDelete = async (id: number) => {
    if (!confirm('Confirmar eliminación de la promoción?')) return
    try {
      const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
      await waitForToken(5000)
      const res = await apiFetch(`${base}/admin/promotions/${id}`, { method: 'DELETE' })
      if (!res.ok) throw new Error('No se pudo eliminar la promoción')
      setPromotions((current) => current.filter((p) => p.id !== id))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error')
    }
  }

  if (isForm) return <PromotionForm />

  return (
    <main className="admin-promotions">
      <h1>Promociones (Admin)</h1>
      <p>Crear, editar y previsualizar promociones.</p>
      <a className="primary-button" href="/admin/promotions/new">Crear promoción</a>
      {loading ? (
        <div role="status">Cargando promociones...</div>
      ) : error ? (
        <div role="alert">{error}</div>
      ) : (
        <ul>
          {promotions.map((p) => (
            <li key={p.id}>
              <strong>{p.name}</strong> — {p.discount_type === 'percentage' ? `${p.value}%` : new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(p.value)} {p.stackable ? '(stackable)' : ''}
              {' '}
              <a href={`/admin/promotions/${p.id}`}>Editar</a>
              {' '}
              <button type="button" onClick={() => void handleDelete(p.id)}>Eliminar</button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
