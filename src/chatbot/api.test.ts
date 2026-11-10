import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { SESSION_STORAGE_KEY } from '../auth/session'
import { ChatApiError, createConversation, getConversation, sendMessage } from './api'

const conversation = {
  conversation: {
    id: 'api-test-conversation',
    created_at: '2026-11-07T08:00:00Z',
    updated_at: '2026-11-07T08:00:00Z',
    expires_at: '2026-12-07T08:00:00Z',
    messages: [],
  },
}

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => sessionStorage.clear())
afterEach(() => {
  server.resetHandlers()
  sessionStorage.clear()
})
afterAll(() => server.close())

function setSession(token: string) {
  sessionStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({ access_token: token }))
}

describe('chatbot API authentication', () => {
  it('sends the current bearer token when creating, reading, and messaging a conversation', async () => {
    setSession('synthetic-access-token')
    const authorizationHeaders: Array<string | null> = []

    server.use(
      http.post('*/api/v1/chat/conversations', ({ request }) => {
        authorizationHeaders.push(request.headers.get('authorization'))
        return HttpResponse.json(conversation, { status: 201 })
      }),
      http.get('*/api/v1/chat/conversations/api-test-conversation', ({ request }) => {
        authorizationHeaders.push(request.headers.get('authorization'))
        return HttpResponse.json(conversation)
      }),
      http.post('*/api/v1/chat/conversations/api-test-conversation/messages', ({ request }) => {
        authorizationHeaders.push(request.headers.get('authorization'))
        return HttpResponse.json({
          conversation_id: 'api-test-conversation',
          answer: 'Respuesta de prueba.',
          sources: [],
          recommendations: [],
          created_at: '2026-11-07T08:01:00Z',
        })
      }),
    )

    await createConversation()
    await getConversation('api-test-conversation')
    await sendMessage('api-test-conversation', { message: 'Pregunta de prueba.' })

    expect(authorizationHeaders).toEqual([
      'Bearer synthetic-access-token',
      'Bearer synthetic-access-token',
      'Bearer synthetic-access-token',
    ])
  })

  it('does not send a bearer token for anonymous requests', async () => {
    const authorizationHeaders: Array<string | null> = []

    server.use(
      http.post('*/api/v1/chat/conversations', ({ request }) => {
        authorizationHeaders.push(request.headers.get('authorization'))
        return HttpResponse.json(conversation, { status: 201 })
      }),
      http.get('*/api/v1/chat/conversations/api-test-conversation', ({ request }) => {
        authorizationHeaders.push(request.headers.get('authorization'))
        return HttpResponse.json(conversation)
      }),
      http.post('*/api/v1/chat/conversations/api-test-conversation/messages', ({ request }) => {
        authorizationHeaders.push(request.headers.get('authorization'))
        return HttpResponse.json({
          conversation_id: 'api-test-conversation',
          answer: 'Respuesta anónima de prueba.',
          sources: [],
          recommendations: [],
          created_at: '2026-11-07T08:01:00Z',
        })
      }),
    )

    await createConversation()
    await getConversation('api-test-conversation')
    await sendMessage('api-test-conversation', { message: 'Pregunta anónima de prueba.' })

    expect(authorizationHeaders).toEqual([null, null, null])
  })

  it('does not retry an authenticated failure without its bearer token', async () => {
    setSession('synthetic-access-token')
    const authorizationHeaders: Array<string | null> = []

    server.use(
      http.post('*/api/v1/chat/conversations', ({ request }) => {
        authorizationHeaders.push(request.headers.get('authorization'))
        return HttpResponse.json({ code: 'UNAUTHENTICATED' }, { status: 401 })
      }),
    )

    await expect(createConversation()).rejects.toBeInstanceOf(ChatApiError)

    expect(authorizationHeaders).toEqual(['Bearer synthetic-access-token'])
  })
})
