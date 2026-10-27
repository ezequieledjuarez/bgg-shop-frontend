import { vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ProductForm from './ProductForm'
import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import ProductForm from './ProductForm'

describe('ProductForm', () => {
  beforeEach(() => {
    // ensure pathname for new product
    Object.defineProperty(window, 'location', { value: new URL('http://localhost/admin/products/new'), writable: true })
    // provide a fake session token so apiFetch doesn't block on auth
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'admin-token' }))
  })
  afterEach(() => vi.restoreAllMocks())

  it('shows validation errors for empty fields', async () => {
    render(<ProductForm />)
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    const nameError = await screen.findByText('El nombre es obligatorio')
    const priceError = await screen.findByText('Precio inválido')
    expect(nameError).toBeDefined()
    expect(priceError).toBeDefined()
  })

  it('maps server field errors to inputs', async () => {
    const body = JSON.stringify({ errors: [{ field: 'price', message: 'required' }] })
    const mock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(body, { status: 400, headers: { 'Content-Type': 'application/json' } }))
    render(<ProductForm />)
    fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Juego' } })
    fireEvent.change(screen.getByLabelText(/Precio/i), { target: { value: '100' } })
    fireEvent.change(screen.getByLabelText(/Cantidad/i), { target: { value: '1' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    const mapped = await screen.findByText('required')
    expect(mapped).toBeDefined()
    expect(mock).toHaveBeenCalled()
  })
})
