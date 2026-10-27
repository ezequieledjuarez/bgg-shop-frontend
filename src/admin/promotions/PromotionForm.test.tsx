import { render, screen, fireEvent } from '@testing-library/react'
import { vi } from 'vitest'
import PromotionForm from './PromotionForm'

describe('PromotionForm', () => {
  beforeEach(() => {
    Object.defineProperty(window, 'location', { value: new URL('http://localhost/admin/promotions/new'), writable: true })
    // provide a fake session token so apiFetch doesn't block on auth
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'admin-token' }))
  })
  afterEach(() => vi.restoreAllMocks())

  it('validates required fields', async () => {
    render(<PromotionForm />)
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    const nameErr = await screen.findByText('El nombre es obligatorio')
    const valErr = await screen.findByText('Valor inválido')
    expect(nameErr).toBeDefined()
    expect(valErr).toBeDefined()
  })

  it('maps server-side field errors', async () => {
    const body = JSON.stringify({ errors: [{ field: 'value', message: 'must be positive' }] })
    const mock = vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response(body, { status: 400, headers: { 'Content-Type': 'application/json' } }))
    render(<PromotionForm />)
    fireEvent.change(screen.getByLabelText(/Nombre/i), { target: { value: 'Promo' } })
    fireEvent.change(screen.getByLabelText(/Valor/i), { target: { value: '10' } })
    fireEvent.click(screen.getByRole('button', { name: /guardar/i }))
    const mapped = await screen.findByText('must be positive')
    expect(mapped).toBeDefined()
    expect(mock).toHaveBeenCalled()
  })
})
