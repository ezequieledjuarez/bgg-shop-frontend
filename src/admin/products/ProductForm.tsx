import React, { useEffect, useState } from 'react'
import apiFetch, { waitForToken } from '../../lib/apiClient'
import createAbortController from '../../lib/abort'

type FieldErrors = Record<string, string>

export default function ProductForm() {
  const pathname = window.location.pathname
  const parts = pathname.split('/').filter(Boolean)
  let editingId: string | undefined = undefined
  let isNew = false
  if (parts[0] === 'admin' && parts[1] === 'products') {
    if (parts[2] === 'new') isNew = true
    else if (parts[2]) editingId = parts[2]
  }

  const [name, setName] = useState('')
  const [price, setPrice] = useState('')
  const [quantity, setQuantity] = useState('0')
  const [bggId, setBggId] = useState('')
  const [releaseYear, setReleaseYear] = useState('')
  const [minPlayers, setMinPlayers] = useState('')
  const [maxPlayers, setMaxPlayers] = useState('')
  const [playingTimeMinutes, setPlayingTimeMinutes] = useState('')
  const [minAge, setMinAge] = useState('')
  const [maxAge, setMaxAge] = useState('')
  const [weight, setWeight] = useState('')
  const [category, setCategory] = useState('')
  const [publisher, setPublisher] = useState('')
  const [imageFileName, setImageFileName] = useState('')
  const [imageUrl, setImageUrl] = useState('')
  const [errors, setErrors] = useState<FieldErrors>({})
  const [saving, setSaving] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  useEffect(() => {
    if (editingId) {
      const controller = createAbortController()
      const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

      

      ;(async () => {
        // wait and then use centralized apiFetch
        const token = await waitForToken(5000)
        // Debug: log headers used when loading single product
        // eslint-disable-next-line no-console
        console.info('Admin product GET token present', Boolean(token))
        try {
          const res = await apiFetch(`${base}/admin/products/${editingId}`, { signal: controller.signal })
          if (!res.ok) throw new Error('No se pudo cargar el producto')
          const payload = (await res.json()) as any
          setName(payload.name || payload.title || '')
          setPrice(String(payload.price ?? payload.price_amount ?? ''))
          setQuantity(String(payload.quantity ?? '0'))
          setBggId(String(payload.bgg_id ?? payload.bggId ?? ''))
          setReleaseYear(String(payload.release_year ?? payload.releaseYear ?? ''))
          setMinPlayers(String(payload.min_players ?? payload.minPlayers ?? ''))
          setMaxPlayers(String(payload.max_players ?? payload.maxPlayers ?? ''))
          setPlayingTimeMinutes(String(payload.playing_time_minutes ?? payload.playingTimeMinutes ?? ''))
          setMinAge(String(payload.min_age ?? payload.minAge ?? ''))
          setMaxAge(String(payload.max_age ?? payload.maxAge ?? ''))
          setWeight(String(payload.weight ?? ''))
          setCategory(Array.isArray(payload.category) ? payload.category.join(', ') : (payload.category || ''))
          setPublisher(String(payload.publisher ?? ''))
          setImageFileName(String(payload.image_file_name ?? payload.imageFileName ?? ''))
          setImageUrl(String(payload.image_url ?? payload.imageUrl ?? ''))
        } catch (err: unknown) {
          if (err instanceof DOMException && err.name === 'AbortError') return
          setLoadError(err instanceof Error ? err.message : 'Error desconocido')
        }
      })()
      return () => controller.abort()
    }
    return
  }, [editingId])

  const handleServerErrors = async (response: Response) => {
    try {
      const payload = await response.json()
      // Expecting { errors: [{ field, message }] }
      if (payload && Array.isArray(payload.errors)) {
        const next: FieldErrors = {}
        for (const err of payload.errors) {
          if (err && err.field) next[err.field] = err.message || 'Error en el campo'
        }
        setErrors(next)
        return
      }
    } catch {
      // ignore json parse errors
    }
    setErrors({ __global: 'Error de servidor' })
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    // Read current DOM values to avoid relying on potentially batched/async state updates
    const el = (id: string) => document.getElementById(id) as HTMLInputElement | null
    const nameVal = el('product-name')?.value || ''
    const priceVal = el('product-price')?.value || ''
    const quantityVal = el('product-quantity')?.value || '0'
    const bggIdVal = el('product-bggid')?.value || ''
    const releaseYearVal = el('product-release-year')?.value || ''
    const minPlayersVal = el('product-min-players')?.value || ''
    const maxPlayersVal = el('product-max-players')?.value || ''
    const playingTimeVal = el('product-playing-time')?.value || ''
    const minAgeVal = el('product-min-age')?.value || ''
    const maxAgeVal = el('product-max-age')?.value || ''
    const weightVal = el('product-weight')?.value || ''
    const categoryVal = el('product-category')?.value || ''
    const publisherVal = el('product-publisher')?.value || ''
    const imageFileNameVal = el('product-image-file')?.value || ''
    const imageUrlVal = el('product-image-url')?.value || ''

    // perform validation on DOM values
    const next: FieldErrors = {}
    if (!nameVal.trim()) next.name = 'El nombre es obligatorio'
    const p = Number(priceVal)
    if (!priceVal || Number.isNaN(p) || p <= 0) next.price = 'Precio inválido'
    const q = Number(quantityVal)
    if (!Number.isInteger(q) || q < 0) next.quantity = 'Cantidad inválida'
    if (bggIdVal && (!Number.isInteger(Number(bggIdVal)) || Number(bggIdVal) <= 0)) next.bggId = 'BGG ID inválido'
    if (releaseYearVal && (!Number.isInteger(Number(releaseYearVal)) || Number(releaseYearVal) < 1800)) next.releaseYear = 'Año inválido'
    setErrors(next)
    if (Object.keys(next).length > 0) return
    setSaving(true)
    setErrors({})
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
    try {
      // Build a complete body containing all DB fields except id.
      // Use null or sensible defaults for empty optional fields so the API
      // receives a full representation rather than omitting keys.
      const body: any = {
        name: nameVal.trim(),
        price: Number(priceVal),
        priceAmount: Number(priceVal),
        quantity: Number(quantityVal),
        bggId: bggIdVal ? Number(bggIdVal) : null,
        releaseYear: releaseYearVal ? Number(releaseYearVal) : null,
        minPlayers: minPlayersVal ? Number(minPlayersVal) : null,
        maxPlayers: maxPlayersVal ? Number(maxPlayersVal) : null,
        playingTimeMinutes: playingTimeVal ? Number(playingTimeVal) : null,
        minAge: minAgeVal ? Number(minAgeVal) : null,
        maxAge: maxAgeVal ? Number(maxAgeVal) : null,
        weight: weightVal ? Number(weightVal) : null,
        category: categoryVal ? categoryVal.split(',').map(c => c.trim()).filter(Boolean) : [],
        publisher: publisherVal || null,
        imageFileName: imageFileNameVal || null,
        imageUrl: imageUrlVal || null,
      }
      const url = editingId ? `${base}/admin/products/${editingId}` : `${base}/admin/products`
      const method = editingId ? 'PUT' : 'POST'
      
      await waitForToken(5000)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      // Use centralized apiFetch which will inject Authorization
      const res = await apiFetch(url, { method, headers, body: JSON.stringify(body) })
      if (!res.ok) {
        // Log response for debugging in E2E runs without consuming body
        try {
          const text = await res.clone().text()
          // eslint-disable-next-line no-console
          console.error('Admin create product failed', { url, method, status: res.status, requestBody: body, responseText: text })
        } catch {
          // ignore
        }
        await handleServerErrors(res)
        setSaving(false)
        return
      }
      // Log success for visibility in Playwright traces, include headers and body snippet
      try {
        const hdrs: Record<string, string> = {}
        res.headers.forEach((v: string, k: string) => { hdrs[k] = v })
        let bodyText = ''
        try {
          bodyText = await res.clone().text()
        } catch (e) {
          bodyText = '<no body or unreadable>'
        }
        // eslint-disable-next-line no-console
        console.info('Admin create product succeeded', { status: res.status, headers: hdrs, bodySnippet: bodyText.slice(0, 2000) })
      } catch (logErr) {
        // eslint-disable-next-line no-console
        console.info('Admin create product succeeded', res.status)
      }
      // Success — redirect back to products list
      window.location.href = '/admin/products'
    } catch (err) {
      setErrors({ __global: 'No se pudo conectar con el servicio' })
    } finally {
      setSaving(false)
    }
  }

  return (
    <main className="admin-product-form">
      <h1>{editingId ? `Editar producto ${editingId}` : isNew ? 'Crear producto' : 'Producto'}</h1>
      {loadError && <div role="alert">{loadError}</div>}
      <form onSubmit={handleSubmit} noValidate>
        <label htmlFor="product-name">Nombre
          <input id="product-name" value={name} onChange={(e) => setName(e.target.value)} />
          {errors.name && <p role="alert">{errors.name}</p>}
        </label>
        <label htmlFor="product-bggid">BGG ID
          <input id="product-bggid" value={bggId} onChange={(e) => setBggId(e.target.value)} />
          {errors.bggId && <p role="alert">{errors.bggId}</p>}
        </label>
        <label htmlFor="product-release-year">Año
          <input id="product-release-year" value={releaseYear} onChange={(e) => setReleaseYear(e.target.value)} />
        </label>
        <label htmlFor="product-min-players">Jugadores min
          <input id="product-min-players" value={minPlayers} onChange={(e) => setMinPlayers(e.target.value)} />
        </label>
        <label htmlFor="product-max-players">Jugadores max
          <input id="product-max-players" value={maxPlayers} onChange={(e) => setMaxPlayers(e.target.value)} />
        </label>
        <label htmlFor="product-playing-time">Tiempo (min)
          <input id="product-playing-time" value={playingTimeMinutes} onChange={(e) => setPlayingTimeMinutes(e.target.value)} />
        </label>
        <label htmlFor="product-min-age">Edad mínima
          <input id="product-min-age" value={minAge} onChange={(e) => setMinAge(e.target.value)} />
        </label>
        <label htmlFor="product-max-age">Edad máxima
          <input id="product-max-age" value={maxAge} onChange={(e) => setMaxAge(e.target.value)} />
        </label>
        <label htmlFor="product-weight">Peso
          <input id="product-weight" value={weight} onChange={(e) => setWeight(e.target.value)} />
        </label>
        <label htmlFor="product-category">Categorías (coma-separadas)
          <input id="product-category" value={category} onChange={(e) => setCategory(e.target.value)} />
        </label>
        <label htmlFor="product-publisher">Editorial
          <input id="product-publisher" value={publisher} onChange={(e) => setPublisher(e.target.value)} />
        </label>
        <label htmlFor="product-image-file">Image file name
          <input id="product-image-file" value={imageFileName} onChange={(e) => setImageFileName(e.target.value)} />
        </label>
        <label htmlFor="product-image-url">Image URL
          <input id="product-image-url" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />
        </label>
        <label htmlFor="product-price">Precio
          <input id="product-price" value={price} onChange={(e) => setPrice(e.target.value)} />
          {errors.price && <p role="alert">{errors.price}</p>}
        </label>
        <label htmlFor="product-quantity">Cantidad
          <input id="product-quantity" value={quantity} onChange={(e) => setQuantity(e.target.value)} />
          {errors.quantity && <p role="alert">{errors.quantity}</p>}
        </label>
        {errors.__global && <p role="alert">{errors.__global}</p>}
        <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</button>
      </form>
    </main>
  )
}
