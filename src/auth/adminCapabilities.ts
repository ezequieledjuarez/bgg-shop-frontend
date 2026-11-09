import type { components } from '../types/generated/bff-api'
import apiFetch from '../lib/apiClient'

export type AdminCapabilities = components['schemas']['CurrentUserCapabilities']

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

export function isAdminCapabilities(value: unknown): value is AdminCapabilities {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length === 2
    && keys.includes('is_staff')
    && keys.includes('is_superuser')
    && typeof (value as Record<string, unknown>).is_staff === 'boolean'
    && typeof (value as Record<string, unknown>).is_superuser === 'boolean'
}

export async function fetchAdminCapabilities(signal: AbortSignal): Promise<AdminCapabilities> {
  const response = await apiFetch(`${apiBaseUrl}/auth/me`, {
    method: 'GET',
    cache: 'no-store',
    signal,
    waitForTokenAttempts: 1,
    waitForTokenTimeout: 1000,
    waitForTokenInterval: 100,
  })
  if (!response.ok) throw new Error('No pudimos verificar tus permisos para administración.')

  const payload: unknown = await response.json()
  if (!isAdminCapabilities(payload)) {
    throw new Error('No pudimos verificar tus permisos para administración.')
  }
  return payload
}
