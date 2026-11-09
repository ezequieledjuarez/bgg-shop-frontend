import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import apiFetch from './apiClient'
import { ADMIN_AUTHORIZATION_DENIED_EVENT, operationKeyFor } from '../auth/session'

describe('apiFetch', () => {
beforeEach(() => {
sessionStorage.clear()
// @ts-ignore
global.fetch = undefined
})

afterEach(() => { vi.unstubAllEnvs() })

it('uses the optional operation key for an allowed admin operation', async () => {
vi.stubEnv('VITE_USE_OPKEY', 'true')
sessionStorage.setItem('bgg-shop.session', JSON.stringify({
	access_token: 'synthetic-jwt', op_key: 'synthetic-op-key',
	op_key_expires_at: '2099-01-01T00:00:00Z', ops: ['POST:/api/v1/admin/*'],
}))
const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
vi.stubGlobal('fetch', request)
await apiFetch('http://localhost:5000/api/v1/admin/products', { method: 'POST' })
const headers = request.mock.calls[0][1].headers as Headers
expect(headers.get('X-Op-Key')).toBe('synthetic-op-key')
expect(headers.get('Authorization')).toBeNull()
})

it('keeps JWT when the operation key is disabled, expired, or outside the trusted API', async () => {
sessionStorage.setItem('bgg-shop.session', JSON.stringify({
	access_token: 'synthetic-jwt', op_key: 'synthetic-op-key',
	op_key_expires_at: '2000-01-01T00:00:00Z', ops: ['POST:/api/v1/admin/*'],
}))
const request = vi.fn().mockResolvedValue(new Response(null, { status: 204 }))
vi.stubGlobal('fetch', request)
vi.stubEnv('VITE_USE_OPKEY', 'true')
await apiFetch('http://localhost:5000/api/v1/admin/products', { method: 'POST' })
expect((request.mock.calls[0][1].headers as Headers).get('Authorization')).toBe('Bearer synthetic-jwt')
expect((request.mock.calls[0][1].headers as Headers).get('X-Op-Key')).toBeNull()
})

it('never selects an operation key for a different origin or a disallowed operation', () => {
vi.stubEnv('VITE_USE_OPKEY', 'true')
sessionStorage.setItem('bgg-shop.session', JSON.stringify({
	access_token: 'synthetic-jwt', op_key: 'synthetic-op-key',
	op_key_expires_at: '2099-01-01T00:00:00Z', ops: ['GET:/api/v1/admin/products'],
}))
expect(operationKeyFor('https://untrusted.example/api/v1/admin/products', 'GET')).toBeUndefined()
expect(operationKeyFor('http://localhost:5000/api/v1/admin/products', 'POST')).toBeUndefined()
vi.stubEnv('VITE_USE_OPKEY', 'false')
expect(operationKeyFor('http://localhost:5000/api/v1/admin/products', 'GET')).toBeUndefined()
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

it('uses bearer authentication, never an operation key, for the current-user endpoint', async () => {
vi.stubEnv('VITE_USE_OPKEY', 'true')
sessionStorage.setItem('bgg-shop.session', JSON.stringify({
	access_token: 'synthetic-jwt', op_key: 'synthetic-op-key',
	op_key_expires_at: '2099-01-01T00:00:00Z', ops: ['GET:/api/v1/admin/*'],
}))
const request = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }))
vi.stubGlobal('fetch', request)

await apiFetch('http://localhost:5000/api/v1/auth/me', { cache: 'no-store' })

const headers = request.mock.calls[0][1].headers as Headers
expect(headers.get('Authorization')).toMatch(/^Bearer /)
expect(headers.get('X-Op-Key')).toBeNull()
expect(request.mock.calls[0][1].cache).toBe('no-store')
})

it('invalidates the admin role snapshot after an observed admin authorization denial', async () => {
sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'synthetic-jwt' }))
const request = vi.fn().mockResolvedValue(new Response(null, { status: 403 }))
vi.stubGlobal('fetch', request)
const denied = vi.fn()
window.addEventListener(ADMIN_AUTHORIZATION_DENIED_EVENT, denied)

await apiFetch('http://localhost:5000/api/v1/admin/products')

window.removeEventListener(ADMIN_AUTHORIZATION_DENIED_EVENT, denied)
expect(denied).toHaveBeenCalledTimes(1)
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
