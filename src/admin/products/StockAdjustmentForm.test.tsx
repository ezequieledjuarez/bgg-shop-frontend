import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import StockAdjustmentForm from './StockAdjustmentForm'

const movementId = 'c5b25794-1086-4fdb-a68c-c42e8e87abf3'

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function selectMovement(direction: 'IN' | 'OUT', quantity: string): void {
  fireEvent.change(screen.getByLabelText('Tipo de movimiento'), { target: { value: direction } })
  fireEvent.change(screen.getByLabelText('Cantidad a ajustar'), { target: { value: quantity } })
}

describe('StockAdjustmentForm', () => {
  beforeEach(() => {
    localStorage.clear()
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'admin-token' }))
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('requires a positive whole number before allocating a movement ID', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
    render(<StockAdjustmentForm productId={42} />)
    selectMovement('IN', '1.5')
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }))

    expect(await screen.findByText(/entero positivo/i)).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('rejects quantities above the API maximum before allocating a movement ID', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
    render(<StockAdjustmentForm productId={42} />)
    const input = screen.getByLabelText('Cantidad a ajustar')
    expect(input).toHaveAttribute('max', '2147483647')
    selectMovement('IN', '2147483648')
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }))

    expect(await screen.findByText(/menor o igual a 2147483647/i)).toBeDefined()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('applies an IN movement and reports the server result', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ movement_id: movementId }))
      .mockResolvedValueOnce(jsonResponse({
        movement_id: movementId,
        status: 'APPLIED',
        requested_quantity: 4,
        applied_quantity: 4,
        quantity_before: 5,
        quantity_after: 9,
      }))
    render(<StockAdjustmentForm productId={42} />)
    selectMovement('IN', '4')

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }))

    expect(await screen.findByText(/solicitadas: 4/i)).toBeDefined()
    expect(screen.getByText(/aplicadas: 4/i)).toBeDefined()
    expect(screen.getByText(/existencia final: 9/i)).toBeDefined()
    const stockCall = fetchMock.mock.calls[1]
    expect(stockCall[0]).toBe('http://localhost:5000/api/v1/admin/products/42/stock')
    expect(JSON.parse(String(stockCall[1]?.body))).toEqual({
      movement_id: movementId,
      direction: 'IN',
      quantity: 4,
    })
    expect(localStorage.length).toBe(0)
  })

  it('reports an OUT movement partially applied to zero', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ movement_id: movementId }))
      .mockResolvedValueOnce(jsonResponse({
        movement_id: movementId,
        status: 'APPLIED',
        requested_quantity: 10,
        applied_quantity: 3,
        quantity_before: 3,
        quantity_after: 0,
        warning: 'OUT_PARTIALLY_APPLIED',
      }))
    render(<StockAdjustmentForm productId={42} />)
    selectMovement('OUT', '10')

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }))

    expect(await screen.findByText(/solicitadas: 10/i)).toBeDefined()
    expect(screen.getByText(/aplicadas: 3/i)).toBeDefined()
    expect(screen.getByText(/existencia final: 0/i)).toBeDefined()
    expect(screen.getByText(/parcial/i)).toBeDefined()
    expect(JSON.parse(String(fetchMock.mock.calls[1][1]?.body))).toEqual({
      movement_id: movementId,
      direction: 'OUT',
      quantity: 10,
    })
  })

  it('persists uncertain movements and requires explicit status lookup and exact-payload retry', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ movement_id: movementId }))
      .mockResolvedValueOnce(jsonResponse({ error: 'upstream error' }, 502))
      .mockResolvedValueOnce(jsonResponse({ movement_id: movementId }, 404))
      .mockResolvedValueOnce(jsonResponse({
        movement_id: movementId,
        status: 'APPLIED',
        requested_quantity: 2,
        applied_quantity: 2,
        quantity_before: 5,
        quantity_after: 7,
      }))
    const firstRender = render(<StockAdjustmentForm productId={42} />)
    selectMovement('IN', '2')
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }))

    expect(await screen.findByText(/no se pudo confirmar el resultado/i)).toBeDefined()
    expect(localStorage.getItem('bgg-shop:stock-adjustment:v1:42')).toContain(movementId)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    firstRender.unmount()
    render(<StockAdjustmentForm productId={42} />)
    expect(fetchMock).toHaveBeenCalledTimes(2)

    fireEvent.click(screen.getByRole('button', { name: 'Consultar estado' }))
    expect(await screen.findByText(/no confirma.*revertido/i)).toBeDefined()
    expect(screen.getByRole('button', { name: 'Reintentar el mismo ajuste' })).toBeEnabled()
    expect(fetchMock).toHaveBeenCalledTimes(3)

    fireEvent.click(screen.getByRole('button', { name: 'Reintentar el mismo ajuste' }))
    expect(await screen.findByText(/existencia final: 7/i)).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(4)
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({
      movement_id: movementId,
      direction: 'IN',
      quantity: 2,
    })
    expect(localStorage.length).toBe(0)
  })

  it('requires an explicit replay to retrieve quantities after status reports APPLIED', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ movement_id: movementId }))
      .mockResolvedValueOnce(jsonResponse({ error: 'unknown' }, 502))
      .mockResolvedValueOnce(jsonResponse({ movement_id: movementId, status: 'APPLIED' }))
      .mockResolvedValueOnce(jsonResponse({
        movement_id: movementId,
        status: 'APPLIED',
        requested_quantity: 6,
        applied_quantity: 6,
        quantity_before: 1,
        quantity_after: 7,
      }))
    render(<StockAdjustmentForm productId={42} />)
    selectMovement('IN', '6')
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar ajuste' }))
    expect(await screen.findByText(/no se pudo confirmar el resultado/i)).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Consultar estado' }))
    expect(await screen.findByText(/estado es APPLIED/i)).toBeDefined()
    expect(fetchMock).toHaveBeenCalledTimes(3)

    fireEvent.click(screen.getByRole('button', { name: 'Recuperar resultado' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(4))
    expect(await screen.findByText(/solicitadas: 6/i)).toBeDefined()
    expect(JSON.parse(String(fetchMock.mock.calls[3][1]?.body))).toEqual({
      movement_id: movementId,
      direction: 'IN',
      quantity: 6,
    })
    expect(localStorage.length).toBe(0)
  })

  it('disables the submit button while an ID allocation is pending', async () => {
    let resolveId: ((response: Response) => void) | undefined
    const allocation = new Promise<Response>((resolve) => {
      resolveId = resolve
    })
    const fetchMock = vi.spyOn(global, 'fetch').mockReturnValueOnce(allocation)
    render(<StockAdjustmentForm productId={42} />)
    selectMovement('IN', '1')
    const submit = screen.getByRole('button', { name: 'Aplicar ajuste' })
    fireEvent.click(submit)
    fireEvent.click(submit)

    expect(submit).toBeDisabled()
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
    resolveId?.(jsonResponse({ movement_id: movementId }))
    fetchMock.mockResolvedValueOnce(jsonResponse({
      movement_id: movementId,
      status: 'APPLIED',
      requested_quantity: 1,
      applied_quantity: 1,
      quantity_before: 0,
      quantity_after: 1,
    }))
    expect(await screen.findByText(/solicitadas: 1/i)).toBeDefined()
  })

  it('does not replace another tab’s unresolved movement for the same product', async () => {
    const fetchMock = vi.spyOn(global, 'fetch')
      .mockResolvedValueOnce(jsonResponse({ movement_id: movementId }))
      .mockResolvedValueOnce(jsonResponse({ error: 'uncertain' }, 502))
    const firstTab = render(<StockAdjustmentForm productId={42} />)
    const secondTab = render(<StockAdjustmentForm productId={42} />)
    const firstInput = firstTab.container.querySelector('input[type="number"]')
    const secondInput = secondTab.container.querySelector('input[type="number"]')
    expect(firstInput).not.toBeNull()
    expect(secondInput).not.toBeNull()
    const firstApply = firstTab.container.querySelector('button[type="submit"]')
    const secondApply = secondTab.container.querySelector('button[type="submit"]')
    expect(firstApply).not.toBeNull()
    expect(secondApply).not.toBeNull()
    fireEvent.change(secondInput!, { target: { value: '3' } })
    fireEvent.change(firstInput!, { target: { value: '2' } })
    fireEvent.click(firstApply!)

    expect(await screen.findByText(/no se pudo confirmar el resultado/i)).toBeDefined()
    const savedPending = localStorage.getItem('bgg-shop:stock-adjustment:v1:42')
    expect(savedPending).toContain(movementId)

    fireEvent.click(secondApply!)

    expect(await screen.findByText(/ya existe un ajuste pendiente para este producto/i)).toBeDefined()
    expect(localStorage.getItem('bgg-shop:stock-adjustment:v1:42')).toBe(savedPending)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
