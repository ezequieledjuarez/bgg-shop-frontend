export type CatalogSortOrder = 'default' | 'price-low' | 'price-high'

export interface CatalogUrlState {
  search: string
  categoryName: string
  publisher: string
  year: string
  minPlayers: string
  maxPlayers: string
  minPrice: string
  maxPrice: string
  page: number
  sort: CatalogSortOrder
}

export const emptyCatalogUrlState: CatalogUrlState = {
  search: '',
  categoryName: '',
  publisher: '',
  year: '',
  minPlayers: '',
  maxPlayers: '',
  minPrice: '',
  maxPrice: '',
  page: 1,
  sort: 'default',
}

function singleValue(params: URLSearchParams, name: string): string | undefined {
  const values = params.getAll(name)
  return values.length === 1 ? values[0] : undefined
}

function catalogValue(params: URLSearchParams, canonicalName: string, legacyName: string): string | undefined {
  const selectedName = params.has(canonicalName) ? canonicalName : legacyName
  return singleValue(params, selectedName)
}

function textValue(params: URLSearchParams, canonicalName: string, legacyName: string, maximum: number): string {
  const value = catalogValue(params, canonicalName, legacyName)?.trim() ?? ''
  return value.length > 0 && value.length <= maximum ? value : ''
}

function integerValue(
  params: URLSearchParams,
  canonicalName: string,
  legacyName: string,
  minimum: number,
  maximum: number,
): string {
  const value = catalogValue(params, canonicalName, legacyName) ?? ''
  if (!/^\d+$/.test(value)) return ''
  const parsed = Number(value)
  return Number.isSafeInteger(parsed) && parsed >= minimum && parsed <= maximum ? value : ''
}

function decimalValue(params: URLSearchParams, canonicalName: string, legacyName: string): string {
  const value = catalogValue(params, canonicalName, legacyName) ?? ''
  if (!/^\d+(?:\.\d+)?$/.test(value)) return ''
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 ? value : ''
}

export function readCatalogUrlState(search = window.location.search): CatalogUrlState {
  const params = new URLSearchParams(search)
  const pageValue = integerValue(params, 'pagina', 'page', 1, 10000)
  const orderName = params.has('orden') ? 'orden' : 'sort'
  const sortValue = singleValue(params, orderName)
  return {
    search: textValue(params, 'busqueda', 'search', 200),
    categoryName: textValue(params, 'categoria', 'category_name', 250),
    publisher: textValue(params, 'editorial', 'publisher', 250),
    year: integerValue(params, 'anio', 'year_published', 0, 9999),
    minPlayers: integerValue(params, 'jugadores_min', 'min_players', 1, 999),
    maxPlayers: integerValue(params, 'jugadores_max', 'max_players', 1, 999),
    minPrice: decimalValue(params, 'precio_min', 'price_min'),
    maxPrice: decimalValue(params, 'precio_max', 'price_max'),
    page: pageValue ? Number(pageValue) : 1,
    sort: orderName === 'orden'
      ? sortValue === 'precio-ascendente' ? 'price-low'
        : sortValue === 'precio-descendente' ? 'price-high' : 'default'
      : sortValue === 'price-low' || sortValue === 'price-high' ? sortValue : 'default',
  }
}

export function catalogUrl(state: CatalogUrlState, hash = ''): string {
  const params = new URLSearchParams()
  if (state.search) params.set('busqueda', state.search)
  if (state.categoryName) params.set('categoria', state.categoryName)
  if (state.publisher) params.set('editorial', state.publisher)
  if (state.year) params.set('anio', state.year)
  if (state.minPlayers) params.set('jugadores_min', state.minPlayers)
  if (state.maxPlayers) params.set('jugadores_max', state.maxPlayers)
  if (state.minPrice) params.set('precio_min', state.minPrice)
  if (state.maxPrice) params.set('precio_max', state.maxPrice)
  if (state.page > 1) params.set('pagina', String(state.page))
  if (state.sort === 'price-high') params.set('orden', 'precio-descendente')
  else if (state.sort === 'price-low') params.set('orden', 'precio-ascendente')
  const query = params.toString()
  return `/catalogo${query ? `?${query}` : ''}${hash}`
}
