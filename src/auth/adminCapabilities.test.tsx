import { describe, expect, it } from 'vitest'
import { isAdminCapabilities } from './adminCapabilities'

describe('isAdminCapabilities', () => {
  it('accepts the exact generated capability response shape', () => {
    expect(isAdminCapabilities({ is_staff: true, is_superuser: false })).toBe(true)
    expect(isAdminCapabilities({ is_staff: false, is_superuser: true })).toBe(true)
    expect(isAdminCapabilities({ is_staff: false, is_superuser: false })).toBe(true)
  })

  it.each([
    null,
    [],
    {},
    { is_staff: true },
    { is_staff: 'true', is_superuser: false },
    { is_staff: false, is_superuser: 0 },
    { is_staff: false, is_superuser: false, email: 'synthetic@example.test' },
  ])('rejects malformed or non-minimal responses: %j', (value) => {
    expect(isAdminCapabilities(value)).toBe(false)
  })
})
