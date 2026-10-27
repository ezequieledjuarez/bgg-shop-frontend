import { describe, it, expect, vi, beforeEach } from 'vitest'
import apiFetch from './apiClient'

describe('apiFetch', () => {
beforeEach(() => {
sessionStorage.clear()
// @ts-ignore
global.fetch = undefined
})

it('injects Authorization header when token present', async () => {
sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'abc-123' }))

// capture the passed headers
// @ts-ignore
global.fetch = vi.fn().mockImplementation((input, init) => {
const headers = (init && (init as any).headers) as Headers
expect(headers.get('Authorization')).toBe('Bearer abc-123')
return Promise.resolve(new Response(null, { status: 204 }))
})

const resp = await apiFetch('/test', { method: 'GET' })
expect(resp).toBeDefined()
})

it('dispatches bgg:request-token when token missing and eventually throws', async () => {
const spy = vi.fn()
window.addEventListener('bgg:request-token', spy)

// no token in sessionStorage
// ensure fetch is not called
// @ts-ignore
global.fetch = vi.fn().mockImplementation(() => {
throw new Error('should not be called')
})

await expect(apiFetch('/no-token', { method: 'GET', waitForTokenTimeout: 50, waitForTokenInterval: 10, waitForTokenAttempts: 2 })).rejects.toThrow('Authentication token not available after retries')
expect(spy).toHaveBeenCalled()
})
})
