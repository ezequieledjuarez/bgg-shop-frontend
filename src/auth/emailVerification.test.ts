import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  captureVerificationFragment,
  clearCapturedVerificationToken,
  confirmEmailVerification,
  getCapturedVerificationToken,
  resendEmailVerification,
} from './emailVerification'

const token = 'A'.repeat(43)

function history() {
  return { state: { n: 1 }, replaceState: vi.fn() }
}

afterEach(() => {
  clearCapturedVerificationToken()
  vi.unstubAllGlobals()
})

describe('verification fragment capture', () => {
  it('keeps the token in memory and scrubs the fragment from history', () => {
    const h = history()
    captureVerificationFragment({ pathname: '/verify-email', search: '?a=1', hash: `#token=${token}` }, h)
    expect(getCapturedVerificationToken()).toBe(token)
    expect(h.replaceState).toHaveBeenCalledWith(h.state, '', '/verify-email?a=1')
  })

  it('scrubs malformed fragments without keeping them', () => {
    const h = history()
    captureVerificationFragment({ pathname: '/verify-email', search: '', hash: '#token=short' }, h)
    expect(getCapturedVerificationToken()).toBeNull()
    expect(h.replaceState).toHaveBeenCalledWith(h.state, '', '/verify-email')
  })

  it('ignores other routes', () => {
    const h = history()
    captureVerificationFragment({ pathname: '/registro', search: '', hash: `#token=${token}` }, h)
    expect(getCapturedVerificationToken()).toBeNull()
    expect(h.replaceState).not.toHaveBeenCalled()
  })
})

describe('verification requests', () => {
  const respond = (status: number, body: unknown = {}) =>
    vi.stubGlobal('fetch', vi.fn(() => Promise.resolve(new Response(JSON.stringify(body), { status }))))

  it('confirms with an explicit credential-free POST', async () => {
    respond(200)
    await expect(confirmEmailVerification(token)).resolves.toEqual({ kind: 'ok' })
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(String(url)).toContain('/auth/email-verification/confirm')
    expect(init).toMatchObject({ method: 'POST', credentials: 'omit', referrerPolicy: 'no-referrer', body: JSON.stringify({ token }) })
    expect(String(url)).not.toContain(token)
  })

  it.each([
    [400, { kind: 'invalid' }],
    [503, { kind: 'unavailable' }],
    [502, { kind: 'failed' }],
    [500, { kind: 'failed' }],
  ])('maps confirm status %s', async (status, expected) => {
    respond(status)
    await expect(confirmEmailVerification(token)).resolves.toEqual(expected)
  })

  it('maps throttling with a bounded retry delay', async () => {
    respond(429, { retry_after_seconds: 119.2 })
    await expect(resendEmailVerification(' a@b.test ')).resolves.toEqual({ kind: 'throttled', retryAfterSeconds: 120 })
    respond(429, {})
    await expect(resendEmailVerification('a@b.test')).resolves.toEqual({ kind: 'throttled', retryAfterSeconds: 1 })
  })

  it('treats resend 202 as accepted and trims the email', async () => {
    respond(202)
    await expect(resendEmailVerification(' a@b.test ')).resolves.toEqual({ kind: 'ok' })
    expect(vi.mocked(fetch).mock.calls[0][1]).toMatchObject({ body: JSON.stringify({ email: 'a@b.test' }) })
  })

  it('reports network failures without detail', async () => {
    vi.stubGlobal('fetch', vi.fn(() => Promise.reject(new Error(token))))
    await expect(confirmEmailVerification(token)).resolves.toEqual({ kind: 'failed' })
  })
})
