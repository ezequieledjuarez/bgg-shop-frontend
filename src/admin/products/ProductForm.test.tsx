import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import type { components } from '../../types/generated/bff-api'
import ProductForm from './ProductForm'

function productDetails(
  bggId: number,
  name: string,
  quantity: number,
): components['schemas']['Product'] {
  return {
    bgg_id: bggId,
    name,
    release_year: 2020,
    min_players: 2,
    max_players: 4,
    playing_time_minutes: 60,
    min_age: 8,
    weight: 1.5,
    category: [],
    price: 100,
    publisher: 'Editorial',
    image_url: '/media/juego.webp',
    quantity,
  }
}

function fillRequiredCreateFields() {
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Juego' } })
  fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '100' } })
  fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '1' } })
}

describe('ProductForm', () => {
  beforeEach(() => {
    sessionStorage.clear()
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost/admin/products/new'),
      writable: true,
    })
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'synthetic-admin-token' }))
  })

  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it('shows errors for required fields and a missing image reference', async () => {
    render(<ProductForm />)
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByText('El nombre es obligatorio')).toBeInTheDocument()
    expect(screen.getByText('El precio debe ser mayor que 0')).toBeInTheDocument()
    expect(screen.getByText('La cantidad es obligatoria')).toBeInTheDocument()
    expect(screen.getAllByText('Indica una sola referencia de imagen (.webp)')).toHaveLength(2)
  })

  it('validates image XOR and .webp, then submits a single filename reference', async () => {
    const createdProduct: components['schemas']['AdminProductSummary'] = {
      bgg_id: 123,
      name: 'Juego',
    }
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(createdProduct), { status: 201 }),
    )
    render(<ProductForm />)
    fillRequiredCreateFields()
    fireEvent.change(screen.getByLabelText(/^Nombre o ruta de imagen/), {
      target: { value: 'media/juego.webp' },
    })
    fireEvent.change(screen.getByLabelText(/^URL de imagen/), {
      target: { value: '/media/juego.webp' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findAllByText('Indica una sola referencia de imagen (.webp)')).toHaveLength(2)
    expect(request).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/^Nombre o ruta de imagen/), {
      target: { value: '' },
    })
    fireEvent.change(screen.getByLabelText(/^URL de imagen/), {
      target: { value: '/media/juego.png' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    expect(await screen.findByText('La referencia debe terminar en .webp')).toBeInTheDocument()
    expect(request).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/^URL de imagen/), { target: { value: '' } })
    fireEvent.change(screen.getByLabelText(/^Nombre o ruta de imagen/), {
      target: { value: 'catalogo/media/juego.webp' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => expect(request).toHaveBeenCalledOnce())
    const requestOptions = request.mock.calls[0][1]
    const requestBody = JSON.parse(String(requestOptions?.body)) as Record<string, unknown>
    expect(new Headers(requestOptions?.headers).get('Content-Type')).toBe('application/json')
    expect(requestBody.image_file_name).toBe('catalogo/media/juego.webp')
    expect(requestBody).not.toHaveProperty('image_url')
    expect(requestBody).not.toHaveProperty('image')
  })

  it('enforces the OpenAPI numeric bounds before sending a create request', async () => {
    const request = vi.spyOn(globalThis, 'fetch')
    render(<ProductForm />)
    fillRequiredCreateFields()
    fireEvent.change(screen.getByLabelText('Precio'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Cantidad'), { target: { value: '-1' } })
    fireEvent.change(screen.getByLabelText('BGG ID'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Año'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Jugadores min'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Jugadores max'), { target: { value: '-1' } })
    fireEvent.change(screen.getByLabelText('Tiempo (min)'), { target: { value: '0' } })
    fireEvent.change(screen.getByLabelText('Edad mínima'), { target: { value: '-1' } })
    fireEvent.change(screen.getByLabelText('Edad máxima'), { target: { value: '-1' } })
    fireEvent.change(screen.getByLabelText('Peso'), { target: { value: '-0.1' } })
    fireEvent.change(screen.getByLabelText('URL de imagen (.webp)'), {
      target: { value: '/media/juego.webp' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    expect(await screen.findByText('El precio debe ser mayor que 0')).toBeInTheDocument()
    for (const label of [
      'Cantidad',
      'BGG ID',
      'Año',
      'Jugadores min',
      'Jugadores max',
      'Tiempo \\(min\\)',
      'Edad mínima',
      'Edad máxima',
      'Peso',
    ]) {
      expect(screen.getByLabelText(new RegExp(`^${label}`))).toHaveAttribute('aria-invalid', 'true')
    }
    expect(request).not.toHaveBeenCalled()
  })

  it('maps server field errors to their associated inputs', async () => {
    const responseBody: components['schemas']['AdminFieldErrorResponse'] = {
      errors: [{ field: 'price', code: 'invalid', message: 'El precio fue rechazado' }],
    }
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify(responseBody), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    render(<ProductForm />)
    fillRequiredCreateFields()
    fireEvent.change(screen.getByLabelText('URL de imagen (.webp)'), {
      target: { value: '/media/juego.webp' },
    })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    const error = await screen.findByText('El precio fue rechazado')
    expect(error).toHaveAttribute('id', 'product-price-error')
    expect(screen.getByLabelText(/^Precio/)).toHaveAttribute('aria-describedby', 'product-price-error')
    expect(request).toHaveBeenCalledOnce()
  })

  it('shows read-only stock and sends only changed fields in a partial edit', async () => {
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost/admin/products/42'),
      writable: true,
    })
    const request = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(productDetails(42, 'Juego agotado', 0)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        bgg_id: 42,
        name: 'Juego actualizado',
      } satisfies components['schemas']['AdminProductSummary']), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    render(<ProductForm />)
    expect(await screen.findByText('Sin stock')).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Cantidad$/i)).toBeNull()
    fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Juego actualizado' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))

    await waitFor(() => expect(request).toHaveBeenCalledTimes(2))
    const updateBody = JSON.parse(String(request.mock.calls[1][1]?.body)) as Record<string, unknown>
    expect(updateBody).toEqual({ name: 'Juego actualizado' })
    expect(updateBody).not.toHaveProperty('quantity')
    expect(updateBody).not.toHaveProperty('bgg_id')
  })

  it('shows current nonzero inventory in edit mode without an editable quantity field', async () => {
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost/admin/products/43'),
      writable: true,
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(
      JSON.stringify(productDetails(43, 'Juego disponible', 7)),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    ))

    render(<ProductForm />)
    expect(await screen.findByText(/Existencias actuales: 7/i)).toBeInTheDocument()
    expect(screen.queryByLabelText(/^Cantidad$/i)).toBeNull()
  })

  it('shows an explicit error when edit data cannot be loaded', async () => {
    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost/admin/products/45'),
      writable: true,
    })
    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      new Response(JSON.stringify({ error: 'Product lookup failed' }), { status: 502 }),
    )

    render(<ProductForm />)
    expect(await screen.findByRole('alert')).toHaveTextContent('No se pudo cargar el producto')
    expect(screen.queryByRole('button', { name: /guardar/i })).toBeNull()
  })

  it('refreshes the read-only inventory after a confirmed stock adjustment', async () => {
    const movementId = 'c5b25794-1086-4fdb-a68c-c42e8e87abf3'
    const request = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify(productDetails(44, 'Juego', 3)), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ movement_id: movementId }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        movement_id: movementId,
        status: 'APPLIED',
        requested_quantity: 10,
        applied_quantity: 3,
        quantity_before: 3,
        quantity_after: 0,
      }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }))

    Object.defineProperty(window, 'location', {
      value: new URL('http://localhost/admin/products/44'),
      writable: true,
    })
    render(<ProductForm />)

    expect(await screen.findByText('Existencias actuales: 3')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Tipo de movimiento'), { target: { value: 'OUT' } })
    fireEvent.change(screen.getByLabelText('Cantidad a ajustar'), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }))

    expect(await screen.findByText('Sin stock')).toBeInTheDocument()
    expect(screen.getByText(/aplicadas: 3/i)).toBeInTheDocument()
    expect(request).toHaveBeenCalledTimes(3)
  })
})
