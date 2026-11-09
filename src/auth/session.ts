export const SESSION_STORAGE_KEY = 'bgg-shop.session'
export const SESSION_CHANGE_EVENT = 'bgg-shop:session-change'
export const ADMIN_AUTHORIZATION_DENIED_EVENT = 'bgg-shop:admin-authorization-denied'

export function operationKeyFor(input: RequestInfo | URL, method: string): string | undefined {
	if (import.meta.env.VITE_USE_OPKEY !== 'true') return undefined
	try {
		const session = JSON.parse(sessionStorage.getItem(SESSION_STORAGE_KEY) ?? '{}') as {
			op_key?: string; op_key_expires_at?: string; ops?: unknown
		}
		const expiry = Date.parse(session.op_key_expires_at ?? '')
		if (!session.op_key || !Number.isFinite(expiry) || expiry <= Date.now() || !Array.isArray(session.ops)) return undefined
		const base = new URL(import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1', window.location.origin)
		const address = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
		const target = new URL(address, window.location.origin)
		const adminPrefix = `${base.pathname.replace(/\/$/, '')}/admin/`
		if (target.origin !== base.origin || !target.pathname.startsWith(adminPrefix)) return undefined
		const operation = `${method.toUpperCase()}:${target.pathname}`
		const allowed = session.ops.some((value: unknown) => typeof value === 'string' && (
			value.endsWith('*') ? operation.startsWith(value.slice(0, -1)) : operation === value
		))
		return allowed ? session.op_key : undefined
	} catch {
		return undefined
	}
}
