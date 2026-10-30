import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen } from '@testing-library/react'
import ProductsList from './ProductsList'

describe('ProductsList', () => {
  afterEach(() => {
    cleanup()
    sessionStorage.clear()
    vi.restoreAllMocks()
  })

  it.each(['success', 'failure'] as const)('does not expose the session on %s', async (outcome) => {
    const token = 'synthetic-private-token'
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: token }))
    const info = vi.spyOn(console, 'info').mockImplementation(() => {})
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    const request = vi.spyOn(globalThis, 'fetch')
    if (outcome === 'success') {
      request.mockResolvedValueOnce(new Response(JSON.stringify({ items: [] }), { status: 200 }))
    } else {
      request.mockRejectedValueOnce(new Error(token))
    }

    render(<ProductsList />)
    await screen.findByRole(outcome === 'success' ? 'table' : 'alert')
    expect(request).toHaveBeenCalledOnce()
    expect(request.mock.calls[0][1]?.headers).toEqual({ Authorization: `Bearer ${token}` })
    expect(info).not.toHaveBeenCalled()
    expect(error).not.toHaveBeenCalled()
    expect(document.body.textContent).not.toContain(token)
  })
})