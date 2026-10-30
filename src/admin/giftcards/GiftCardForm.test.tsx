import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import apiFetch from '../../lib/apiClient'
import App from '../../App'

vi.mock('../../lib/apiClient', () => ({ default: vi.fn() }))

const mockedFetch = vi.mocked(apiFetch)

describe('admin gift card issuance', () => {
  beforeEach(() => {
    window.history.replaceState({}, '', '/admin/gift-cards')
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'admin-token' }))
    mockedFetch.mockReset()
  })

  afterEach(() => {
    sessionStorage.clear()
    window.history.replaceState({}, '', '/')
    vi.restoreAllMocks()
  })

  it('validates the amount before issuing', () => {
    render(<App />)
    fireEvent.change(screen.getByLabelText('Importe (ARS)'), { target: { value: '0' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generar tarjeta' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Ingresá un importe válido')
    expect(mockedFetch).not.toHaveBeenCalled()
  })

  it('issues a card and displays its code only in the current view', async () => {
    const code = 'a'.repeat(64)
    mockedFetch.mockResolvedValueOnce(new Response(JSON.stringify({ id: '11111111-2222-4333-8444-555555555555', code, amount: '20000.00', currency: 'ARS' }), { status: 201 }))
    render(<App />)
    fireEvent.change(screen.getByLabelText('Importe (ARS)'), { target: { value: '20000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generar tarjeta' }))
    expect(await screen.findByLabelText('Código generado')).toHaveValue(code)
    expect(mockedFetch).toHaveBeenCalledTimes(1)
    expect(mockedFetch.mock.calls[0][0]).toContain('/admin/gift-cards')
    expect(JSON.parse(String(mockedFetch.mock.calls[0][1]?.body))).toEqual({ amount: '20000' })
    fireEvent.click(screen.getByRole('button', { name: 'Generar otra tarjeta' }))
    expect(screen.queryByLabelText('Código generado')).not.toBeInTheDocument()
    expect(sessionStorage.getItem('bgg-shop.session')).not.toContain(code)
  })

  it('shows forbidden without retrying issuance', async () => {
    mockedFetch.mockResolvedValueOnce(new Response('{}', { status: 403 }))
    render(<App />)
    fireEvent.change(screen.getByLabelText('Importe (ARS)'), { target: { value: '20000' } })
    fireEvent.click(screen.getByRole('button', { name: 'Generar tarjeta' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('permisos de administrador'))
    expect(mockedFetch).toHaveBeenCalledTimes(1)
  })
})