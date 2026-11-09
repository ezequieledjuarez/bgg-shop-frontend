import { ADMIN_AUTHORIZATION_DENIED_EVENT, operationKeyFor } from '../auth/session'

// Minimal HTTP client wrapper to centralize Authorization injection,
// wait-for-token logic and correlation header generation.
export async function waitForToken(timeout = 10000, interval = 100): Promise<string | undefined> {
  const start = Date.now()
  while (Date.now() - start < timeout) {
    try {
      const raw = sessionStorage.getItem('bgg-shop.session') ?? '{}'
      const s = JSON.parse(raw) as { access_token?: string }
      if (s && s.access_token) return s.access_token
    } catch {
      // ignore parse errors
    }
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, interval))
  }
  return undefined
}

export function generateCorrelationId(): string {
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export type ApiFetchOptions = RequestInit & {
  waitForTokenTimeout?: number
  waitForTokenInterval?: number
  waitForTokenAttempts?: number
  correlationId?: string
}

export async function apiFetch(input: RequestInfo, init?: ApiFetchOptions): Promise<Response> {
  const opts = init ?? {}
  const timeout = opts.waitForTokenTimeout ?? 10000
  const interval = opts.waitForTokenInterval ?? 100
  const attempts = opts.waitForTokenAttempts ?? 3
  const headers = new Headers(opts.headers ?? {})
  const opKey = headers.has('Authorization') ? undefined : operationKeyFor(input, opts.method ?? 'GET')

  // Try to obtain a token, retrying and signaling the app to refresh if missing.
  let token: string | undefined
  for (let attempt = 1; !opKey && !headers.has('Authorization') && attempt <= attempts; attempt++) {
    token = await waitForToken(timeout, interval)
    if (token) break
    if (attempt < attempts) {
      // Signal the host app to attempt a token retrieval (e.g. silent refresh or rehydrate)
      try {
        // Apps can listen for this event to re-run auth flows.
        window.dispatchEvent(new CustomEvent('bgg:request-token'))
      } catch (e) {
        // ignore if dispatch unavailable
      }
    }
  }

  // build headers
  if (opKey) {
    headers.set('X-Op-Key', opKey)
  } else if (token) {
    if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${token}`)
  }

  const correlation = opts.correlationId ?? headers.get('X-Debug-Correlation') ?? generateCorrelationId()
  if (!headers.has('X-Debug-Correlation')) headers.set('X-Debug-Correlation', correlation)
  if (!headers.has('X-Debug-Timestamp')) headers.set('X-Debug-Timestamp', new Date().toISOString())

  const finalInit: RequestInit = { ...opts, headers }

  // Sanitize signal: some environments (tests/jsdom/undici) can produce
  // cross-realm AbortSignal objects which the platform fetch rejects.
  // If the provided signal is not an instance of the current global AbortSignal,
  // drop it to avoid throwing when calling `fetch`.
  try {
    const sig = (finalInit as any).signal
    if (sig && typeof sig === 'object' && typeof (globalThis as any).AbortSignal === 'function' && !(sig instanceof (globalThis as any).AbortSignal)) {
      // Remove incompatible signal; callers using cancellation should
      // pass a compatible AbortSignal from the same realm.
      delete (finalInit as any).signal
    }
  } catch (e) {
    // ignore
  }

  // Ensure credentials are included for same-origin API calls (BFF proxy expects cookies)
  try {
    // Only set credentials when not explicitly provided by caller
    if (!('credentials' in finalInit) || finalInit.credentials === undefined) {
      let shouldInclude = false
      try {
        const urlStr = typeof input === 'string' ? input : (input as Request).url
        const resolved = new URL(urlStr, window.location.origin)
        if (resolved.pathname.startsWith('/api/')) shouldInclude = true
      } catch (e) {
        // If URL parsing fails, conservatively do not modify credentials
      }
      if (shouldInclude) finalInit.credentials = 'include'
    }
  } catch (e) {
    // ignore
  }

  if (!token && !opKey && !headers.has('Authorization')) {
    // Final failure after retries — caller should handle skipping unauthenticated calls.
    throw new Error('Authentication token not available after retries')
  }

  const response = await fetch(input, finalInit)
  if (response.status === 401 || response.status === 403) {
    try {
      const base = new URL(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1', window.location.origin)
      const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const target = new URL(address, window.location.origin)
      const adminPrefix = `${base.pathname.replace(/\/$/, '')}/admin/`
      if (target.origin === base.origin && target.pathname.startsWith(adminPrefix)) {
        window.dispatchEvent(new Event(ADMIN_AUTHORIZATION_DENIED_EVENT))
      }
    } catch {
      // Invalid or non-URL requests do not invalidate the current role snapshot.
    }
  }
  return response
}

export default apiFetch
