import { describe, expect, it } from 'vitest'
import { catalogUrl, readCatalogUrlState } from './urlState'

describe('catalog URL state', () => {
  it('reads supported filters, pagination, and sort state', () => {
    expect(readCatalogUrlState(
      '?search=watergate&category_name=Strategy&publisher=Asmodee&year_published=2020'
      + '&min_players=2&max_players=4&price_min=10&price_max=20&page=3&sort=price-low',
    )).toEqual({
      search: 'watergate',
      categoryName: 'Strategy',
      publisher: 'Asmodee',
      year: '2020',
      minPlayers: '2',
      maxPlayers: '4',
      minPrice: '10',
      maxPrice: '20',
      page: 3,
      sort: 'price-low',
    })
  })

  it('reads every canonical Spanish catalog parameter and both sort directions', () => {
    expect(readCatalogUrlState(
      '?busqueda=watergate&categoria=Strategy&editorial=Asmodee&anio=2020'
      + '&jugadores_min=2&jugadores_max=4&precio_min=10&precio_max=20'
      + '&pagina=3&orden=precio-descendente',
    )).toEqual({
      search: 'watergate',
      categoryName: 'Strategy',
      publisher: 'Asmodee',
      year: '2020',
      minPlayers: '2',
      maxPlayers: '4',
      minPrice: '10',
      maxPrice: '20',
      page: 3,
      sort: 'price-high',
    })
    expect(readCatalogUrlState('?orden=precio-ascendente').sort).toBe('price-low')
  })

  it('uses the single legacy value only when its Spanish key is absent', () => {
    expect(readCatalogUrlState('?busqueda=Watergate&search=ignored').search).toBe('Watergate')
    expect(readCatalogUrlState('?search=Watergate').search).toBe('Watergate')
    expect(readCatalogUrlState('?category_name=Strategy').categoryName).toBe('Strategy')
    expect(readCatalogUrlState('?publisher=Asmodee').publisher).toBe('Asmodee')
    expect(readCatalogUrlState('?year_published=2020').year).toBe('2020')
    expect(readCatalogUrlState('?min_players=2&max_players=4')).toMatchObject({
      minPlayers: '2',
      maxPlayers: '4',
    })
    expect(readCatalogUrlState('?price_min=0.5&price_max=20').minPrice).toBe('0.5')
    expect(readCatalogUrlState('?page=2').page).toBe(2)
    expect(readCatalogUrlState('?sort=price-high').sort).toBe('price-high')
    expect(readCatalogUrlState('?sort=price-low').sort).toBe('price-low')
  })

  it('does not fall back when a chosen Spanish key is invalid or repeated', () => {
    expect(readCatalogUrlState('?busqueda=&search=legacy').search).toBe('')
    expect(readCatalogUrlState('?categoria=One&categoria=Two&category_name=Legacy').categoryName).toBe('')
    expect(readCatalogUrlState('?editorial=%20&publisher=Legacy').publisher).toBe('')
    expect(readCatalogUrlState('?pagina=0&page=8').page).toBe(1)
    expect(readCatalogUrlState('?orden=price-high&sort=price-low').sort).toBe('default')
    expect(readCatalogUrlState('?search=One&search=Two').search).toBe('')
    expect(readCatalogUrlState('?sort=price-high&sort=price-low').sort).toBe('default')
  })

  it('accepts only canonical Spanish order values for orden', () => {
    expect(readCatalogUrlState('?orden=price-high').sort).toBe('default')
    expect(readCatalogUrlState('?orden=precio-descendente&sort=price-low').sort).toBe('price-high')
    expect(readCatalogUrlState('?orden=unknown&sort=price-low').sort).toBe('default')
  })

  it('ignores malformed, repeated, and unsupported query values safely', () => {
    expect(readCatalogUrlState(
      '?search=%20&publisher=Asmodee&publisher=Devir&category_name=%20'
      + '&page=-1&sort=unknown&unrecognized=value',
    )).toEqual({
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
    })
  })

  it('drops invalid numeric values without changing other valid selections', () => {
    expect(readCatalogUrlState('?category_name=Strategy&year_published=20xx&page=2')).toEqual({
      search: '',
      categoryName: 'Strategy',
      publisher: '',
      year: '',
      minPlayers: '',
      maxPlayers: '',
      minPrice: '',
      maxPrice: '',
      page: 2,
      sort: 'default',
    })
  })

  it('serializes only canonical filter values and omits defaults', () => {
    expect(catalogUrl({
      search: 'Watergate & Devir',
      categoryName: 'Strategy',
      publisher: 'Asmodee',
      year: '2020',
      minPlayers: '2',
      maxPlayers: '4',
      minPrice: '0',
      maxPrice: '20.5',
      page: 3,
      sort: 'price-high',
    }, '#catalog')).toBe(
      '/catalogo?busqueda=Watergate+%26+Devir&categoria=Strategy&editorial=Asmodee'
      + '&anio=2020&jugadores_min=2&jugadores_max=4&precio_min=0&precio_max=20.5'
      + '&pagina=3&orden=precio-descendente#catalog',
    )
  })

  it('serializes the ascending sort and omits default page and sort', () => {
    expect(catalogUrl({ ...readCatalogUrlState('?orden=precio-ascendente'), search: 'Watergate' }))
      .toBe('/catalogo?busqueda=Watergate&orden=precio-ascendente')
    expect(catalogUrl(readCatalogUrlState())).toBe('/catalogo')
  })
})
