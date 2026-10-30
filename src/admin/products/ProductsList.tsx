import { useEffect, useState } from 'react'

type ProductSummary = {
  id: number
  name: string
  price: number
  quantity: number
}

export default function ProductsList() {
  const [products, setProducts] = useState<ProductSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

    const waitForToken = async (timeout = 3000, interval = 100) => {
      const start = Date.now()
      while (Date.now() - start < timeout) {
        try {
          const s = JSON.parse(sessionStorage.getItem('bgg-shop.session') ?? '{}') as { access_token?: string }
          if (s && s.access_token) return s.access_token
        } catch {
          // ignore
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, interval))
      }
      return undefined
    }

    ;(async () => {
      const token = await waitForToken()
      const headers: Record<string, string> = {}
      if (token) headers.Authorization = `Bearer ${token}`
      try {
        const res = await fetch(`${base}/admin/products?page=1&page_size=50`, { signal: controller.signal, headers })
        if (!res.ok) throw new Error('No se pudo cargar la lista de productos')
        const payload = await res.json()
        // Support different API shapes: { items: [...] } or { results: [...] }
        const items: ProductSummary[] = payload.items || payload.results || []
        setProducts(items)
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
        setError('No se pudo cargar la lista de productos')
      } finally {
        setLoading(false)
      }
    })()
    return () => controller.abort()
  }, [])

  return (
    <main className="admin-products">
      <h1>Productos (Admin)</h1>
      <p>Lista de productos — filtros, paginación y acciones vendrán después.</p>
      <a className="primary-button" href="/admin/products/new">Crear producto</a>
      {loading ? (
        <div role="status">Cargando productos...</div>
      ) : error ? (
        <div role="alert">{error}</div>
      ) : (
        <table className="admin-table" aria-label="Productos">
          <thead>
            <tr>
              <th>Id</th>
              <th>Nombre</th>
              <th>Precio</th>
              <th>Stock</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.id}</td>
                <td>{p.name}</td>
                <td>{new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(p.price)}</td>
                <td>{p.quantity}</td>
                <td><a href={`/admin/products/${p.id}`}>Editar</a></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  )
}
