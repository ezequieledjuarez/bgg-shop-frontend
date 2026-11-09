import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { silentRefresh, getToken, refreshSession } from './api'

describe('silentRefresh', () => {
beforeEach(() => {
sessionStorage.clear()
// reset fetch mock
// @ts-ignore
global.fetch = undefined
})

afterEach(() => {
  vi.unstubAllEnvs()
})

it('stores access_token in sessionStorage and notifies listeners on success', async () => {
sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'expired-access', op_key: 'keep' }))
const mockResp = {
status: 200,
json: async () => ({ access_token: 'tok-xyz' }),
}

// @ts-ignore
global.fetch = vi.fn().mockResolvedValue(mockResp)

const spy = vi.fn()
window.addEventListener('bgg-shop:session-change', spy)

const ok = await silentRefresh()
expect(ok).toBe(true)

const raw = sessionStorage.getItem('bgg-shop.session')
expect(raw).toBeTruthy()
const parsed = JSON.parse(raw as string)
expect(parsed).toEqual({ access_token: 'tok-xyz', op_key: 'keep' })
expect(spy).toHaveBeenCalled()
})

it('returns false on non-200 or malformed response', async () => {
// non-200
// @ts-ignore
global.fetch = vi.fn().mockResolvedValue({ status: 500 })
const ok = await silentRefresh()
expect(ok).toBe(false)

sessionStorage.clear()
// malformed payload
// @ts-ignore
global.fetch = vi.fn().mockResolvedValue({ status: 200, json: async () => ({}) })
const ok2 = await silentRefresh()
expect(ok2).toBe(false)
})

it('uses the configured API base and normalizes its trailing slash', async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://localhost:5000/api/v1/')
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'expired-access' }))
  global.fetch = vi.fn().mockResolvedValue({
    status: 200,
    json: async () => ({ access_token: 'fresh-access' }),
  })

  await refreshSession()

  expect(fetch).toHaveBeenCalledWith('http://localhost:5000/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
})

it('uses the local BFF fallback base when no API base is configured', async () => {
  vi.stubEnv('VITE_API_BASE_URL', '')
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'expired-access' }))
  global.fetch = vi.fn().mockResolvedValue({
    status: 200,
    json: async () => ({ access_token: 'fresh-access' }),
  })

  await refreshSession()

  expect(fetch).toHaveBeenCalledWith('http://localhost:5000/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
})

it('preserves a relative API base while normalizing its trailing slash', async () => {
  vi.stubEnv('VITE_API_BASE_URL', '/api/v1/')
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'expired-access' }))
  global.fetch = vi.fn().mockResolvedValue({
    status: 200,
    json: async () => ({ access_token: 'fresh-access' }),
  })

  await refreshSession()

  expect(fetch).toHaveBeenCalledWith('/api/v1/auth/refresh', {
    method: 'POST',
    credentials: 'include',
  })
})

it('ignores a successful refresh after the account session changes', async () => {
  let resolveFetch: (response: Response) => void = () => {}
  global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve }))
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'old-account-access' }))

  const pending = refreshSession()
  sessionStorage.removeItem('bgg-shop.session')
  resolveFetch(new Response(JSON.stringify({ access_token: 'stale-access' }), { status: 200 }))

  expect(await pending).toBe('unavailable')
  expect(sessionStorage.getItem('bgg-shop.session')).toBeNull()
})

it('ignores a stale refresh rejection after switching accounts', async () => {
  let resolveFetch: (response: Response) => void = () => {}
  global.fetch = vi.fn(() => new Promise<Response>((resolve) => { resolveFetch = resolve }))
  sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'old-account-access' }))

  const pending = refreshSession()
  const newSession = JSON.stringify({ access_token: 'new-account-access' })
  sessionStorage.setItem('bgg-shop.session', newSession)
  resolveFetch(new Response('{}', { status: 401 }))

  expect(await pending).toBe('unavailable')
  expect(sessionStorage.getItem('bgg-shop.session')).toBe(newSession)
})
})

describe('getToken', () => {
beforeEach(() => sessionStorage.clear())

it('reads token from sessionStorage', () => {
sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 't1' }))
expect(getToken()).toBe('t1')
})

it('returns undefined when no token', () => {
expect(getToken()).toBe(undefined)
})
})
