import { describe, it, expect, vi, beforeEach } from 'vitest'
import { silentRefresh, getToken } from './api'

describe('silentRefresh', () => {
beforeEach(() => {
sessionStorage.clear()
// reset fetch mock
// @ts-ignore
global.fetch = undefined
})

it('stores access_token in sessionStorage and notifies listeners on success', async () => {
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
expect(parsed.access_token).toBe('tok-xyz')
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
