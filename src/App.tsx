import { useState } from 'react'
import './App.css'

type SortOrder = 'featured' | 'price-low' | 'price-high'

type Product = {
  bgg_id: number
  name: string
  release_year: number
  min_players: number
  max_players: number
  playing_time_minutes: number
  min_age: number
  weight: number
  category: string[]
  price: number
  publisher: string
  image_url: string
  featured?: boolean
}

const products: Product[] = [
  { bgg_id: 274364, name: 'Watergate', release_year: 2019, min_players: 2, max_players: 2, playing_time_minutes: 60, min_age: 12, weight: 2.25, category: ['Juegos de Estrategia'], price: 90000, publisher: 'Salt & Pepper Games', image_url: '/media/portadas/2743640.webp', featured: true },
  { bgg_id: 230244, name: 'Black Angel', release_year: 2019, min_players: 1, max_players: 4, playing_time_minutes: 120, min_age: 12, weight: 3.82, category: ['Juegos de Estrategia'], price: 186000, publisher: 'Asmodee Pearl Games', image_url: '/media/portadas/2302440.webp', featured: true },
  { bgg_id: 272409, name: 'Pequeñas Grandes Tácticas', release_year: 2019, min_players: 1, max_players: 4, playing_time_minutes: 60, min_age: 14, weight: 0.24, category: ['Juegos de Estrategia'], price: 101800, publisher: 'Devir', image_url: '/media/portadas/2724090.webp' },
  { bgg_id: 241451, name: "Aeon's End: Legacy", release_year: 2019, min_players: 1, max_players: 4, playing_time_minutes: 90, min_age: 14, weight: 2.84, category: ['Juegos de Estrategia', 'Juegos Temáticos'], price: 181500, publisher: 'SD Games', image_url: '/media/portadas/2414510.webp' },
]

const categories = ['Todos', 'Juegos de Estrategia', 'Juegos Temáticos'] as const

function formatPrice(price: number) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(price)
}

function ProductCard({ product }: { product: Product }) {
  return (
    <article className="product-card">
      <div className="product-image">
        {product.featured && <span className="badge">Destacado</span>}
        <img src={product.image_url} alt={`Portada de ${product.name}`} />
      </div>
      <div className="product-content">
        <div className="product-meta">
          <span>{product.category[0]}</span>
          <span aria-hidden="true">·</span>
          <span>{product.publisher}</span>
        </div>
        <h3>{product.name}</h3>
        <p>{product.playing_time_minutes} minutos de juego · {product.release_year}</p>
        <div className="product-details">
          <span>{product.min_players}–{product.max_players} jugadores</span>
          <span>{product.min_age}+</span>
        </div>
        <div className="product-footer">
          <strong>{formatPrice(product.price)}</strong>
          <button className="text-button" type="button" aria-label={`Ver detalles de ${product.name}`}>
            Ver detalles <span aria-hidden="true">→</span>
          </button>
        </div>
      </div>
    </article>
  )
}

function App() {
  const [search, setSearch] = useState('')
  const [year, setYear] = useState('')
  const [minPlayers, setMinPlayers] = useState('')
  const [maxPlayers, setMaxPlayers] = useState('')
  const [category, setCategory] = useState<(typeof categories)[number]>('Todos')
  const [minPrice, setMinPrice] = useState('')
  const [maxPrice, setMaxPrice] = useState('')
  const [sort, setSort] = useState<SortOrder>('featured')

  const clearFilters = () => {
    setSearch('')
    setYear('')
    setMinPlayers('')
    setMaxPlayers('')
    setCategory('Todos')
    setMinPrice('')
    setMaxPrice('')
    setSort('featured')
  }

  const searchTerm = search.trim().toLocaleLowerCase()
  const selectedYear = year ? Number(year) : undefined
  const selectedMinPlayers = minPlayers ? Number(minPlayers) : undefined
  const selectedMaxPlayers = maxPlayers ? Number(maxPlayers) : undefined
  const selectedMinPrice = minPrice ? Number(minPrice) : undefined
  const selectedMaxPrice = maxPrice ? Number(maxPrice) : undefined

  const visibleProducts = products
    .filter((product) => {
      const matchesSearch = !searchTerm ||
        product.name.toLocaleLowerCase().includes(searchTerm) ||
        product.publisher.toLocaleLowerCase().includes(searchTerm)
      const matchesYear = selectedYear === undefined || product.release_year === selectedYear
      const matchesPlayers =
        (selectedMinPlayers === undefined || product.max_players >= selectedMinPlayers) &&
        (selectedMaxPlayers === undefined || product.min_players <= selectedMaxPlayers)
      const matchesCategory = category === 'Todos' || product.category.includes(category)
      const matchesPrice =
        (selectedMinPrice === undefined || product.price >= selectedMinPrice) &&
        (selectedMaxPrice === undefined || product.price <= selectedMaxPrice)
      return matchesSearch && matchesYear && matchesPlayers && matchesCategory && matchesPrice
    })
    .sort((first, second) => {
      if (sort === 'price-low') return first.price - second.price
      if (sort === 'price-high') return second.price - first.price
      return Number(second.featured) - Number(first.featured)
    })

  return (
    <div className="app-shell">
      <header className="site-header">
        <a className="brand" href="/" aria-label="Meeple, inicio">
          <span className="brand-mark" aria-hidden="true">M</span>
          <span>Meeple</span>
        </a>
        <nav className="main-nav" aria-label="Navegación principal">
          <a className="active" href="#catalogo">Catálogo</a>
          <a href="#categorias">Categorías</a>
          <a href="#editorial">Editoriales</a>
        </nav>
        <div className="account-actions">
          <button type="button" className="login-button">Iniciar sesión</button>
          <button type="button" className="register-button">Crear cuenta</button>
        </div>
      </header>

      <main>
        <section className="hero" aria-labelledby="hero-title">
          <div className="hero-copy">
            <p className="eyebrow">Tu próxima partida empieza aquí</p>
            <h1 id="hero-title">Juegos que reúnen<br /><em>grandes historias.</em></h1>
            <p className="hero-lede">Descubre juegos de mesa para compartir, competir y crear recuerdos alrededor de la mesa.</p>
            <a className="primary-button" href="#catalogo">Explorar catálogo <span aria-hidden="true">↗</span></a>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="sun"></div>
            <div className="hero-card hero-card-back"></div>
            <div className="hero-card hero-card-front"><span className="art-label">Play<br />together</span><span className="art-symbol">✦</span></div>
            <span className="art-spark spark-one">✦</span><span className="art-spark spark-two">·</span>
          </div>
        </section>

        <section className="catalog-section" id="catalogo" aria-labelledby="catalog-title">
          <div className="section-heading">
            <div><p className="eyebrow">Selección de la casa</p><h2 id="catalog-title">Juegos para disfrutar</h2></div>
            <a className="view-all" href="#catalogo">Ver todo <span aria-hidden="true">→</span></a>
          </div>
          <div className="filter-panel" aria-label="Filtros del catálogo">
            <div className="filter-row">
              <label>Buscar por nombre o editorial
                <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ej. Devir o Watergate" />
              </label>
              <label>Año de publicación
                <input type="number" min="0" value={year} onChange={(event) => setYear(event.target.value)} />
              </label>
              <label>Mínimo de jugadores
                <input type="number" min="1" value={minPlayers} onChange={(event) => setMinPlayers(event.target.value)} />
              </label>
              <label>Máximo de jugadores
                <input type="number" min="1" value={maxPlayers} onChange={(event) => setMaxPlayers(event.target.value)} />
              </label>
              <label>Precio mínimo
                <input type="number" min="0" value={minPrice} onChange={(event) => setMinPrice(event.target.value)} />
              </label>
              <label>Precio máximo
                <input type="number" min="0" value={maxPrice} onChange={(event) => setMaxPrice(event.target.value)} />
              </label>
            </div>
            <div className="catalog-toolbar">
              <div className="category-list" id="categorias" aria-label="Filtrar por categoría">
                {categories.map((item) => (
                  <button type="button" className={category === item ? 'category active' : 'category'} key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>
                    {item}
                  </button>
                ))}
              </div>
              <label className="sort-control">Ordenar por
                <select value={sort} onChange={(event) => setSort(event.target.value as SortOrder)} aria-label="Ordenar productos">
                  <option value="featured">Recomendados</option>
                  <option value="price-low">Precio menor</option>
                  <option value="price-high">Precio mayor</option>
                </select>
              </label>
            </div>
            <div className="results-summary" aria-live="polite">{visibleProducts.length} resultados</div>
            <button type="button" className="clear-filters" onClick={clearFilters}>Limpiar filtros</button>
          </div>
          {visibleProducts.length === 0 ? (
            <div className="empty-state" role="status">
              <h3>No encontramos juegos</h3>
              <p>Probá con otros criterios o limpiá los filtros.</p>
              <button type="button" className="primary-button" onClick={clearFilters}>Limpiar filtros</button>
            </div>
          ) : (
            <div className="product-grid">{visibleProducts.map((product) => <ProductCard product={product} key={product.bgg_id} />)}</div>
          )}
        </section>

        <section className="editorial-banner" id="editorial" aria-label="Manifiesto de Meeple">
          <p className="eyebrow">Más que una tienda</p>
          <h2>El mundo es mejor<br /><em>cuando jugamos juntos.</em></h2>
          <p>Elegimos cada título pensando en esos momentos que se quedan contigo mucho después de guardar la caja.</p>
        </section>
      </main>

      <footer className="site-footer">
        <a className="brand" href="/" aria-label="Meeple, inicio"><span className="brand-mark" aria-hidden="true">M</span><span>Meeple</span></a>
        <p>Juegos con intención, partidas con alma.</p>
        <small>© 2024 Meeple</small>
      </footer>
    </div>
  )
}

export default App
