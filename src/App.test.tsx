import { fireEvent, render, screen, within } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import App from './App'

describe('Home', () => {
  it('renders the main landmarks and product cards', () => {
    render(<App />)

    expect(screen.getByRole('banner')).toBeVisible()
    expect(screen.getByRole('main')).toBeVisible()
    expect(screen.getByRole('contentinfo')).toBeVisible()
    expect(screen.getByRole('heading', { level: 1 })).toBeVisible()
    expect(screen.getAllByRole('article')).toHaveLength(4)
    screen.getAllByRole('article').forEach((card) => {
      expect(within(card).getByRole('img')).toHaveAccessibleName()
      expect(within(card).getByRole('heading', { level: 3 })).toBeVisible()
    })
  })

  it('exposes accessible navigation and filter controls', () => {
    render(<App />)

    const navigation = screen.getByRole('navigation')
    within(navigation).getAllByRole('link').forEach((link) => {
      const target = link.getAttribute('href')
      expect(target).toMatch(/^#/)
      expect(document.getElementById(target!.slice(1))).toBeInTheDocument()
    })
    expect(screen.getByRole('searchbox', { name: /nombre o editorial/i })).toBeVisible()
    expect(screen.getByRole('spinbutton', { name: /año/i })).toBeVisible()
    expect(screen.getByRole('combobox', { name: 'Ordenar productos' })).toBeVisible()
    expect(screen.getByRole('button', { name: 'Todos' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('filters by text and category', () => {
    render(<App />)

    fireEvent.change(screen.getByRole('searchbox', { name: /nombre o editorial/i }), { target: { value: 'Devir' } })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Pequeñas Grandes Tácticas' })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: 'Todos' }))
    fireEvent.change(screen.getByRole('searchbox', { name: /nombre o editorial/i }), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: 'Juegos Temáticos' }))
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: "Aeon's End: Legacy" })).toBeInTheDocument()
  })

  it('filters by player range and price range', () => {
    render(<App />)

    fireEvent.change(screen.getByRole('spinbutton', { name: /mínimo de jugadores/i }), { target: { value: '2' } })
    fireEvent.change(screen.getByRole('spinbutton', { name: /precio máximo/i }), { target: { value: '100000' } })
    expect(screen.getAllByRole('article')).toHaveLength(1)
    expect(screen.getByRole('heading', { name: 'Watergate' })).toBeInTheDocument()
  })

  it('sorts by price and recovers from an empty result', () => {
    render(<App />)

    fireEvent.change(screen.getByRole('combobox', { name: 'Ordenar productos' }), { target: { value: 'price-low' } })
    expect(screen.getAllByRole('heading', { level: 3 }).map((heading) => heading.textContent)).toEqual([
      'Watergate',
      'Pequeñas Grandes Tácticas',
      "Aeon's End: Legacy",
      'Black Angel',
    ])

    fireEvent.change(screen.getByRole('searchbox', { name: /nombre o editorial/i }), { target: { value: 'inexistente' } })
    expect(screen.getByRole('status')).toHaveTextContent(/no encontramos juegos/i)
    fireEvent.click(screen.getAllByRole('button', { name: /limpiar filtros/i })[1])
    expect(screen.getAllByRole('article')).toHaveLength(4)
  })
})
