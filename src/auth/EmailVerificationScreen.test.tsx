import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from '../App'
import { captureVerificationFragment, clearCapturedVerificationToken } from './emailVerification'

const token = 'B'.repeat(43)

function open(hash: string) {
  window.history.pushState({}, '', `/verify-email${hash}`)
  captureVerificationFragment(window.location, window.history)
}

function stub(status: number, body: unknown = {}) {
  vi.stubGlobal('fetch', vi.fn((input: RequestInfo | URL) => {
    const url = String(input)
    const payload = url.includes('/product-publishers') ? [] : url.includes('/products')
      ? { items: [], page: 1, page_size: 100, total: 0, total_pages: 0 } : body
    return Promise.resolve(new Response(JSON.stringify(payload), { status: url.includes('/email-verification/') ? status : 200 }))
  }))
}

const verificationCalls = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).includes('/email-verification/'))

describe('email verification screen', () => {
  beforeEach(() => sessionStorage.clear())
  afterEach(() => {
    clearCapturedVerificationToken()
    vi.unstubAllGlobals()
    window.history.pushState({}, '', '/')
  })

  it('scrubs the fragment and never consumes the token on page load', () => {
    stub(200)
    open(`#token=${token}`)
    expect(window.location.hash).toBe('')
    render(<App />)
    expect(screen.getByRole('button', { name: 'Confirmar mi correo' })).toBeInTheDocument()
    expect(verificationCalls()).toHaveLength(0)
    expect(document.body.innerHTML).not.toContain(token)
  })

  it('confirms only after the explicit action, once, with no login', async () => {
    stub(200, { verified: true, message: 'ok' })
    open(`#token=${token}`)
    render(<App />)
    const button = screen.getByRole('button', { name: 'Confirmar mi correo' })
    fireEvent.click(button)
    fireEvent.click(button)
    expect(await screen.findByText('Tu correo fue verificado. Ya podés iniciar sesión.')).toBeInTheDocument()
    expect(verificationCalls()).toHaveLength(1)
    expect(verificationCalls()[0][1]).toMatchObject({ method: 'POST', body: JSON.stringify({ token }) })
    expect(sessionStorage.length).toBe(0)
  })

  it('offers a neutral resend path when the link is missing or malformed', async () => {
    stub(202, { message: 'neutral' })
    open('#token=short')
    render(<App />)
    expect(screen.getByRole('alert')).toHaveTextContent('Este enlace de verificación no es válido o venció.')
    fireEvent.change(screen.getByLabelText('Correo para reenviar la verificación'), { target: { value: 'a@b.test' } })
    fireEvent.click(screen.getByRole('button', { name: 'Reenviar correo de verificación' }))
    expect(await screen.findByText('Si la cuenta está pendiente de verificación, te enviamos un nuevo enlace.')).toBeInTheDocument()
  })

  it('moves to the unusable state and drops the token when the BFF reports an invalid link', async () => {
    stub(400, { errors: [{ code: 'INVALID_VERIFICATION_TOKEN' }] })
    open(`#token=${token}`)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar mi correo' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Reenviar correo de verificación' })).toBeInTheDocument())
    expect(screen.queryByRole('button', { name: 'Confirmar mi correo' })).toBeNull()
  })

  it.each([
    [429, { retry_after_seconds: 90 }, 'Esperá 90 segundos'],
    [503, {}, 'La verificación no está disponible'],
    [502, {}, 'No se pudo completar la solicitud'],
  ])('keeps the token available for retry after status %s', async (status, body, text) => {
    stub(status, body)
    open(`#token=${token}`)
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar mi correo' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(text)
    expect(screen.getByRole('button', { name: 'Confirmar mi correo' })).toBeEnabled()
  })
})
