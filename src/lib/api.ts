export function getToken(): string | undefined {
  try {
    const s = JSON.parse(sessionStorage.getItem('bgg-shop.session') ?? '{}') as { access_token?: string }
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

export async function silentRefresh(): Promise<boolean> {
  try {
    const resp = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' })
    if (resp.status !== 200) return false
    const payload = await resp.json()
    const at = payload?.access_token
    if (!at) return false
    // persist access token in sessionStorage in the same shape other code expects
    const raw = JSON.stringify({ access_token: at })
    sessionStorage.setItem('bgg-shop.session', raw)
    // notify listeners that session changed
    try {
      window.dispatchEvent(new Event('bgg-shop:session-change'))
    } catch (e) {
      // ignore
    }
    return true
  } catch (e) {
    return false
  }
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
