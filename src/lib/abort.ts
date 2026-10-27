// Helper to create an AbortController from the current global realm.
// This ensures tests and application code create controllers from the
// same AbortController implementation that `fetch`/`Request` expect.
export function createAbortController(): AbortController {
  const Ctor = (globalThis as any).AbortController ?? (typeof AbortController !== 'undefined' ? AbortController : undefined)
  if (!Ctor) throw new Error('AbortController is not available in this environment')
  return new Ctor()
}

export default createAbortController
