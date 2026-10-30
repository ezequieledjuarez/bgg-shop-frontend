// Register DOM testing matchers and ensure AbortController/AbortSignal consistency
import '@testing-library/jest-dom'

// Ensure AbortController and AbortSignal are the same across realms when running
// tests under jsdom to avoid cross-realm instanceof mismatches that cause
// "Expected signal to be an instance of AbortSignal" errors from fetch.
declare const global: any
try {
  // If window provides AbortController (jsdom), prefer that implementation
  const win = (globalThis as any).window ?? null
  if (win && typeof win.AbortController === 'function') {
    ;(globalThis as any).AbortController = win.AbortController
    ;(globalThis as any).AbortSignal = win.AbortSignal
  }
} catch (e) {
  // ignore
}

// Debug helper: wrap global fetch to log incoming signals during tests
try {
  const origFetch = (globalThis as any).fetch
  // Wrap global Request to remove cross-realm signals created before fetch is called.
  try {
    const OrigRequest = (globalThis as any).Request
    if (typeof OrigRequest === 'function') {
      const RequestWrapper: any = function (input: any, init?: any) {
        try {
          if (init && init.signal) {
            // Remove any signal unconditionally in tests to avoid cross-realm errors
            init = { ...init }
            delete init.signal
          }
        } catch (e) {
          // ignore
        }
        // eslint-disable-next-line new-cap
        return new OrigRequest(input, init)
      }
      RequestWrapper.prototype = OrigRequest.prototype
      ;(globalThis as any).Request = RequestWrapper
    }
  } catch (e) {
    // ignore
  }
  (globalThis as any).fetch = function (_input: any, init?: any) {
    try {
      if (init && init.signal) {
        // Aggressively remove any provided signal in tests to avoid cross-realm
        // AbortSignal instanceof mismatches that cause fetch/Request to throw.
        // eslint-disable-next-line no-console
        console.warn('TEST-FETCH-SIGNAL: removing signal for test', { signalProto: Object.getPrototypeOf(init.signal).constructor?.name })
        // Log call stack for diagnostics
        // eslint-disable-next-line no-console
        console.warn(new Error('Fetch called with signal (removed in test wrapper)').stack)
        init = { ...init }
        delete init.signal
      }
    } catch (e) {
      // ignore logging errors
    }
    return origFetch.apply(this, arguments as any)
  }
} catch (e) {
  // ignore
}
