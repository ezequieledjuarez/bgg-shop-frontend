import { SESSION_CHANGE_EVENT, SESSION_STORAGE_KEY } from '../auth/session'

export function getToken(): string | undefined {
  try {
    const s = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? '{}') as { access_token?: string }
    return s?.access_token
  } catch {
    return undefined
  }
}

export async function authFetch(input: RequestInfo, init: RequestInit = {}, tokenOverride?: string) {
  const headers = new Headers(init.headers as HeadersInit | undefined)
  const token = tokenOverride ?? getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  // ensure content-type header from init is preserved
  const merged: RequestInit = { ...init, headers }
  return fetch(input, merged)
}

export type RefreshResult = 'refreshed' | 'rejected' | 'unavailable'

export async function refreshSession(): Promise<RefreshResult> {
  const sessionSnapshot = sessionStorage.getItem(SESSION_STORAGE_KEY)
  try {
    const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1'
    const refreshUrl = `${apiBaseUrl.replace(/\/+$/, '')}/auth/refresh`
    const resp = await fetch(refreshUrl, { method: 'POST', credentials: 'include' })
    if (sessionStorage.getItem(SESSION_STORAGE_KEY) !== sessionSnapshot) return 'unavailable'
    if (resp.status === 401) {
      sessionStorage.removeItem(SESSION_STORAGE_KEY)
      window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
      return 'rejected'
    }
    if (resp.status !== 200) return 'unavailable'
    const payload: unknown = await resp.json()
    if (sessionStorage.getItem(SESSION_STORAGE_KEY) !== sessionSnapshot) return 'unavailable'
    if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return 'unavailable'
    const accessToken = (payload as Record<string, unknown>).access_token
    if (typeof accessToken !== 'string' || !accessToken) return 'unavailable'
    let existing: Record<string, unknown> = {}
    try {
      const current: unknown = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? '{}')
      if (typeof current === 'object' && current !== null && !Array.isArray(current)) {
        existing = current as Record<string, unknown>
      }
    } catch {
      existing = {}
    }
    sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ ...existing, access_token: accessToken }))
    window.dispatchEvent(new Event(SESSION_CHANGE_EVENT))
    return 'refreshed'
  } catch {
    return 'unavailable'
  }
}

export async function silentRefresh(): Promise<boolean> {
  const result = await refreshSession()
  return result === 'refreshed'
}

export async function waitForToken(timeout = 3000, interval = 100): Promise<string | undefined> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    const t = getToken()
    if (t) return t
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, interval))
  }
  return undefined
}
