import { setupServer } from 'msw/node'
import { handlers } from './handlers'

export const server = setupServer(...handlers)

// Helpers to start/stop server in tests
export async function startMockServer() {
  server.listen({ onUnhandledRequest: 'warn' })
}

export async function stopMockServer() {
  server.close()
}
