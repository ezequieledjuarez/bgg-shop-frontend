import type { components } from '../types/generated/bff-api'

type ConfirmRequest = components['schemas']['ConfirmEmailVerificationRequest']
type ResendRequest = components['schemas']['ResendEmailVerificationRequest']

export type VerificationOutcome =
  | { kind: 'ok' }
  | { kind: 'invalid' }
  | { kind: 'throttled'; retryAfterSeconds: number }
  | { kind: 'unavailable' }
  | { kind: 'failed' }

export const VERIFY_EMAIL_PATH = '/verify-email'

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'
const TOKEN_FRAGMENT = /^#token=([A-Za-z0-9_-]{43})$/

let capturedToken: string | null = null

// The token only ever lives in memory: it is read from the fragment and the fragment is removed
// from the address bar and history entry before any application code can observe the URL.
export function captureVerificationFragment(
  location: Pick<Location, 'pathname' | 'search' | 'hash'>,
  history: Pick<History, 'replaceState' | 'state'>,
): void {
  if (location.pathname !== VERIFY_EMAIL_PATH || !location.hash) return
  const match = TOKEN_FRAGMENT.exec(location.hash)
  capturedToken = match ? match[1] : null
  history.replaceState(history.state, '', `${location.pathname}${location.search}`)
}

export function getCapturedVerificationToken(): string | null {
  return capturedToken
}

export function clearCapturedVerificationToken(): void {
  capturedToken = null
}

captureVerificationFragment(window.location, window.history)

async function post(path: string, body: ConfirmRequest | ResendRequest, okStatus: number): Promise<VerificationOutcome> {
  try {
    const response = await fetch(`${apiBaseUrl}/auth/email-verification/${path}`, {
      method: 'POST',
      credentials: 'omit',
      cache: 'no-store',
      referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (response.status === okStatus) return { kind: 'ok' }
    if (response.status === 400) return { kind: 'invalid' }
    if (response.status === 429) {
      const payload = await response.json().catch(() => null) as { retry_after_seconds?: unknown } | null
      const seconds = payload?.retry_after_seconds
      return { kind: 'throttled', retryAfterSeconds: typeof seconds === 'number' && seconds >= 1 ? Math.ceil(seconds) : 1 }
    }
    if (response.status === 503) return { kind: 'unavailable' }
    return { kind: 'failed' }
  } catch {
    return { kind: 'failed' }
  }
}

export function confirmEmailVerification(token: string): Promise<VerificationOutcome> {
  return post('confirm', { token }, 200)
}

export function resendEmailVerification(email: string): Promise<VerificationOutcome> {
  return post('resend', { email: email.trim() }, 202)
}
