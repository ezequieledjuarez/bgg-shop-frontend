import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import Chatbot from './Chatbot'
import { SESSION_CHANGE_EVENT, SESSION_STORAGE_KEY } from '../auth/session'

const conversationId = 'owned-conversation-013'
const storedConversationKey = 'chatbot.conversationId'
const authenticatedConversationKey = (subject: string) =>
  `chatbot.conversationId.${encodeURIComponent(subject)}`
const priorUserMessage = '¿Qué juegos cooperativos tienen?'
const priorAssistantMessage = 'Tenemos varias opciones cooperativas.'
const newConversationId = 'new-conversation-013'

const ownedConversation = {
  conversation: {
    id: conversationId,
    created_at: '2026-11-06T08:00:00Z',
    updated_at: '2026-11-07T08:00:00Z',
    expires_at: '2026-12-07T08:00:00Z',
    messages: [
      {
        id: 'message-user-1',
        role: 'user',
        content: priorUserMessage,
        created_at: '2026-11-06T08:00:00Z',
        sources: [],
      },
      {
        id: 'message-assistant-1',
        role: 'assistant',
        content: priorAssistantMessage,
        created_at: '2026-11-06T08:01:00Z',
        sources: [],
      },
    ],
  },
}

const createdConversation = {
  conversation: {
    id: newConversationId,
    created_at: '2026-11-07T08:00:00Z',
    updated_at: '2026-11-07T08:00:00Z',
    expires_at: '2026-12-07T08:00:00Z',
    messages: [],
  },
}

const server = setupServer()

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  window.history.replaceState({}, '', '/')
  localStorage.clear()
})
afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
  sessionStorage.clear()
  vi.restoreAllMocks()
})
afterAll(() => server.close())

function openChat() {
  const launcher = screen.getByRole('button', { name: 'Abrir chat del asistente' })
  expect(launcher).toHaveAttribute('aria-expanded', 'false')
  fireEvent.click(launcher)
}

function messageForm() {
  const textbox = screen.getByRole('textbox', { name: /pregunta/i })
  const form = textbox.closest('form')
  expect(form).not.toBeNull()
  return form as HTMLFormElement
}

function accessToken(subject: string) {
  const payload = btoa(JSON.stringify({ sub: subject }))
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
  return `synthetic.${payload}.signature`
}

function setSession(subject: string) {
  sessionStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({ access_token: accessToken(subject) }),
  )
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

function jsonResponse(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('Store chatbot conversation continuation', () => {
  it('loads and continues an owned conversation, retaining only its authorized reference in localStorage', async () => {
    localStorage.setItem(storedConversationKey, conversationId)
    let createdConversationCount = 0
    const continuedConversationIds: string[] = []

    server.use(
      http.get(`*/api/v1/chat/conversations/${conversationId}`, () =>
        HttpResponse.json(ownedConversation, {
          headers: { 'Cache-Control': 'no-store' },
        }),
      ),
      http.post('*/api/v1/chat/conversations', () => {
        createdConversationCount += 1
        return HttpResponse.json(createdConversation, { status: 201 })
      }),
      http.post(`*/api/v1/chat/conversations/${conversationId}/messages`, async ({ request }) => {
        continuedConversationIds.push(conversationId)
        expect(await request.json()).toEqual({ message: '¿Y para dos personas?' })
        return HttpResponse.json({
          conversation_id: conversationId,
          answer: 'Hay opciones cooperativas para dos personas.',
          sources: [],
          recommendations: [],
          created_at: '2026-11-07T08:02:00Z',
        })
      }),
    )

    render(<Chatbot />)
    openChat()

    expect(await screen.findByText(priorUserMessage)).toBeVisible()
    expect(screen.getByText(priorAssistantMessage)).toBeVisible()
    expect(createdConversationCount).toBe(0)

    const storedValues = Array.from({ length: localStorage.length }, (_, index) =>
      localStorage.getItem(localStorage.key(index) ?? ''),
    )
    expect(storedValues).toEqual([conversationId])
    expect(storedValues).not.toContain(priorUserMessage)
    expect(storedValues).not.toContain(priorAssistantMessage)

    fireEvent.change(screen.getByRole('textbox', { name: /pregunta/i }), {
      target: { value: '¿Y para dos personas?' },
    })
    fireEvent.submit(messageForm())

    expect(await screen.findByText('Hay opciones cooperativas para dos personas.')).toBeVisible()
    expect(continuedConversationIds).toEqual([conversationId])
  })

  it.each([
    {
      status: 404,
      response: { code: 'NOT_FOUND', error: 'Conversation not found.' },
    },
    {
      status: 401,
      response: { code: 'UNAUTHENTICATED', error: 'Authentication required.' },
    },
  ])(
    'does not reveal prior content after a $status conversation read failure and offers accessible new-chat recovery',
    async ({ status, response }) => {
      localStorage.setItem(storedConversationKey, conversationId)
      const createRequests: string[] = []

      server.use(
        http.get(`*/api/v1/chat/conversations/${conversationId}`, () =>
          HttpResponse.json(response, { status }),
        ),
        http.post('*/api/v1/chat/conversations', () => {
          createRequests.push('created')
          return HttpResponse.json(createdConversation, { status: 201 })
        }),
      )

      render(<Chatbot />)
      openChat()

      const alert = await screen.findByRole('alert')
      expect(alert).toBeVisible()
      expect(alert).not.toHaveTextContent(/expired|unauthorized|not found|authentication/i)
      expect(screen.queryByText(priorUserMessage)).not.toBeInTheDocument()
      expect(screen.queryByText(priorAssistantMessage)).not.toBeInTheDocument()
      expect(localStorage.getItem(storedConversationKey)).toBeNull()

      const startNewChat = screen.getByRole('button', { name: /iniciar.*(?:nuevo|otra).*chat|nuevo chat/i })
      expect(startNewChat).toBeVisible()
      fireEvent.click(startNewChat)

      expect(await screen.findByRole('textbox', { name: /pregunta/i })).toBeVisible()
      await waitFor(() => expect(createRequests).toEqual(['created']))
      expect(localStorage.getItem(storedConversationKey)).toBe(newConversationId)
      expect(screen.queryByText(priorUserMessage)).not.toBeInTheDocument()
      expect(screen.queryByText(priorAssistantMessage)).not.toBeInTheDocument()
    },
  )

  it('clears the previous account transcript, draft, and reference on logout and login', async () => {
    const createOwners: Array<string | null> = []
    const accountAConversation = {
      conversation: {
        ...createdConversation.conversation,
        id: 'account-a-conversation',
      },
    }
    const accountBConversation = {
      conversation: {
        ...createdConversation.conversation,
        id: 'account-b-conversation',
      },
    }

    setSession('account-a-subject')
    server.use(
      http.post('*/api/v1/chat/conversations', ({ request }) => {
        const authorization = request.headers.get('authorization')
        createOwners.push(authorization)
        if (authorization === `Bearer ${accessToken('account-a-subject')}`) {
          return HttpResponse.json(accountAConversation, { status: 201 })
        }
        if (authorization === `Bearer ${accessToken('account-b-subject')}`) {
          return HttpResponse.json(accountBConversation, { status: 201 })
        }
        return HttpResponse.json(createdConversation, { status: 201 })
      }),
      http.post(
        '*/api/v1/chat/conversations/account-a-conversation/messages',
        () => HttpResponse.json({
          conversation_id: 'account-a-conversation',
          answer: 'Respuesta privada de la cuenta A.',
          sources: [],
          recommendations: [],
          created_at: '2026-11-07T08:02:00Z',
        }),
      ),
    )

    render(<Chatbot />)
    openChat()
    await waitFor(() => {
      expect(sessionStorage.getItem(authenticatedConversationKey('account-a-subject')))
        .toBe('account-a-conversation')
    })

    fireEvent.change(screen.getByRole('textbox', { name: /pregunta/i }), {
      target: { value: 'Pregunta de la cuenta A.' },
    })
    fireEvent.submit(messageForm())
    expect(await screen.findByText('Respuesta privada de la cuenta A.')).toBeVisible()
    fireEvent.change(screen.getByRole('textbox', { name: /pregunta/i }), {
      target: { value: 'Borrador de la cuenta A.' },
    })

    sessionStorage.removeItem(SESSION_STORAGE_KEY)
    act(() => window.dispatchEvent(new Event(SESSION_CHANGE_EVENT)))

    expect(screen.queryByText('Respuesta privada de la cuenta A.')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /pregunta/i })).toHaveValue('')
    expect(screen.getByRole('button', { name: /iniciar.*chat/i })).toBeVisible()

    setSession('account-b-subject')
    act(() => window.dispatchEvent(new Event(SESSION_CHANGE_EVENT)))

    await waitFor(() => {
      expect(sessionStorage.getItem(authenticatedConversationKey('account-b-subject')))
        .toBe('account-b-conversation')
    })
    expect(createOwners).toEqual([
      `Bearer ${accessToken('account-a-subject')}`,
      `Bearer ${accessToken('account-b-subject')}`,
    ])
    expect(sessionStorage.getItem(authenticatedConversationKey('account-a-subject'))).toBeNull()
    expect(localStorage.getItem(storedConversationKey)).toBeNull()
    expect(screen.queryByText('Respuesta privada de la cuenta A.')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: /pregunta/i })).toHaveValue('')
  })

  it('continues the same authenticated conversation after a same-account reload in this tab', async () => {
    setSession('account-a-subject')
    sessionStorage.setItem(
      authenticatedConversationKey('account-a-subject'),
      conversationId,
    )
    let authorization: string | null = null
    server.use(
      http.get(`*/api/v1/chat/conversations/${conversationId}`, ({ request }) => {
        authorization = request.headers.get('authorization')
        return HttpResponse.json(ownedConversation)
      }),
    )

    render(<Chatbot />)
    openChat()

    expect(await screen.findByText(priorUserMessage)).toBeVisible()
    expect(screen.getByText(priorAssistantMessage)).toBeVisible()
    expect(authorization).toBe(`Bearer ${accessToken('account-a-subject')}`)
    expect(localStorage.getItem(storedConversationKey)).toBeNull()
  })

  it('retries a saved conversation once when the same account refreshes its token after a 401', async () => {
    const firstResponse = deferred<Response>()
    const previousToken = accessToken('account-a-subject')
    const refreshedToken = `refreshed.${previousToken.split('.')[1]}.signature`
    const authorizations: Array<string | null> = []
    let requestCount = 0

    setSession('account-a-subject')
    sessionStorage.setItem(
      authenticatedConversationKey('account-a-subject'),
      conversationId,
    )
    server.use(
      http.get(`*/api/v1/chat/conversations/${conversationId}`, async ({ request }) => {
        requestCount += 1
        authorizations.push(request.headers.get('authorization'))
        if (requestCount === 1) return firstResponse.promise
        return HttpResponse.json(ownedConversation)
      }),
    )

    render(<Chatbot />)
    openChat()
    await waitFor(() => expect(requestCount).toBe(1))
    expect(authorizations).toEqual([`Bearer ${previousToken}`])

    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ access_token: refreshedToken }),
    )
    act(() => window.dispatchEvent(new Event(SESSION_CHANGE_EVENT)))
    firstResponse.resolve(HttpResponse.json({ error: 'Unauthorized' }, { status: 401 }))

    expect(await screen.findByText(priorUserMessage)).toBeVisible()
    expect(screen.getByText(priorAssistantMessage)).toBeVisible()
    expect(requestCount).toBe(2)
    expect(authorizations).toEqual([
      `Bearer ${previousToken}`,
      `Bearer ${refreshedToken}`,
    ])
    expect(sessionStorage.getItem(authenticatedConversationKey('account-a-subject')))
      .toBe(conversationId)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('ignores a pending create response from the previous identity', async () => {
    const createResponses = [deferred<Response>(), deferred<Response>()]
    let createRequestCount = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(() => {
      const response = createResponses[createRequestCount]
      createRequestCount += 1
      return response.promise
    })

    setSession('account-a-subject')
    render(<Chatbot />)
    openChat()
    await waitFor(() => expect(createRequestCount).toBe(1))

    setSession('account-b-subject')
    act(() => window.dispatchEvent(new Event(SESSION_CHANGE_EVENT)))
    await waitFor(() => expect(createRequestCount).toBe(2))

    createResponses[0].resolve(jsonResponse({
      conversation: {
        ...createdConversation.conversation,
        id: 'late-account-a-conversation',
      },
    }, 201))
    await waitFor(() => {
      expect(sessionStorage.getItem(authenticatedConversationKey('account-a-subject'))).toBeNull()
    })
    expect(sessionStorage.getItem(authenticatedConversationKey('account-b-subject'))).toBeNull()

    createResponses[1].resolve(jsonResponse({
      conversation: {
        ...createdConversation.conversation,
        id: 'account-b-conversation',
      },
    }, 201))
    await waitFor(() => {
      expect(sessionStorage.getItem(authenticatedConversationKey('account-b-subject')))
        .toBe('account-b-conversation')
    })

    expect(sessionStorage.getItem(authenticatedConversationKey('account-a-subject'))).toBeNull()
    fetchMock.mockRestore()
  })

  it('ignores a pending conversation read after switching accounts', async () => {
    const readResponse = deferred<Response>()
    const createResponse = deferred<Response>()
    let createRequestCount = 0
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.endsWith('/chat/conversations/account-a-conversation')) {
        return readResponse.promise
      }
      createRequestCount += 1
      return createResponse.promise
    })

    setSession('account-a-subject')
    sessionStorage.setItem(
      authenticatedConversationKey('account-a-subject'),
      'account-a-conversation',
    )
    render(<Chatbot />)
    openChat()
    await waitFor(() => expect(createRequestCount).toBe(0))

    setSession('account-b-subject')
    act(() => window.dispatchEvent(new Event(SESSION_CHANGE_EVENT)))
    await waitFor(() => expect(createRequestCount).toBe(1))

    readResponse.resolve(jsonResponse({
      conversation: {
        ...ownedConversation.conversation,
        id: 'account-a-conversation',
      },
    }))
    await waitFor(() => {
      expect(screen.queryByText(priorUserMessage)).not.toBeInTheDocument()
      expect(sessionStorage.getItem(authenticatedConversationKey('account-a-subject'))).toBeNull()
    })

    createResponse.resolve(jsonResponse({
      conversation: {
        ...createdConversation.conversation,
        id: 'account-b-conversation',
      },
    }, 201))
    await waitFor(() => {
      expect(sessionStorage.getItem(authenticatedConversationKey('account-b-subject')))
        .toBe('account-b-conversation')
    })
    expect(screen.queryByText(priorAssistantMessage)).not.toBeInTheDocument()
    fetchMock.mockRestore()
  })

  it('ignores a pending message response after switching accounts', async () => {
    const sendResponse = deferred<Response>()
    let accountBConversationCreated = false
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation((input) => {
      const url = String(input)
      if (url.endsWith('/chat/conversations/account-a-conversation/messages')) {
        return sendResponse.promise
      }
      const isAccountB = sessionStorage.getItem(SESSION_STORAGE_KEY)?.includes(
        accessToken('account-b-subject'),
      )
      if (isAccountB) {
        accountBConversationCreated = true
        return Promise.resolve(jsonResponse({
          conversation: {
            ...createdConversation.conversation,
            id: 'account-b-conversation',
          },
        }, 201))
      }
      return Promise.resolve(jsonResponse({
        conversation: {
          ...createdConversation.conversation,
          id: 'account-a-conversation',
        },
      }, 201))
    })

    setSession('account-a-subject')
    render(<Chatbot />)
    openChat()
    await screen.findByRole('textbox', { name: /pregunta/i })
    await waitFor(() => {
      expect(sessionStorage.getItem(authenticatedConversationKey('account-a-subject')))
        .toBe('account-a-conversation')
    })
    fireEvent.change(screen.getByRole('textbox', { name: /pregunta/i }), {
      target: { value: 'Pregunta enviada por A.' },
    })
    fireEvent.submit(messageForm())

    setSession('account-b-subject')
    act(() => window.dispatchEvent(new Event(SESSION_CHANGE_EVENT)))
    await waitFor(() => expect(accountBConversationCreated).toBe(true))

    sendResponse.resolve(jsonResponse({
      conversation_id: 'account-a-conversation',
      answer: 'Respuesta tardía de la cuenta A.',
      sources: [],
      recommendations: [],
      created_at: '2026-11-07T08:02:00Z',
    }))
    await waitFor(() => {
      expect(screen.queryByText('Respuesta tardía de la cuenta A.')).not.toBeInTheDocument()
      expect(screen.queryByText('Pregunta enviada por A.')).not.toBeInTheDocument()
    })

    expect(sessionStorage.getItem(authenticatedConversationKey('account-b-subject')))
      .toBe('account-b-conversation')
    fetchMock.mockRestore()
  })

  it('keeps the active conversation when a refreshed token has the same subject', async () => {
    let createRequestCount = 0
    let messageAuthorization: string | null = null
    const refreshedToken = `refreshed.${accessToken('account-a-subject').split('.')[1]}.signature`
    server.use(
      http.post('*/api/v1/chat/conversations', ({ request }) => {
        createRequestCount += 1
        expect(request.headers.get('authorization')).toBe(
          `Bearer ${accessToken('account-a-subject')}`,
        )
        return HttpResponse.json({
          conversation: {
            ...createdConversation.conversation,
            id: 'account-a-conversation',
          },
        }, { status: 201 })
      }),
      http.post(
        '*/api/v1/chat/conversations/account-a-conversation/messages',
        ({ request }) => {
          messageAuthorization = request.headers.get('authorization')
          return HttpResponse.json({
            conversation_id: 'account-a-conversation',
            answer: 'Respuesta después de renovar la sesión.',
            sources: [],
            recommendations: [],
            created_at: '2026-11-07T08:02:00Z',
          })
        },
      ),
    )

    setSession('account-a-subject')
    render(<Chatbot />)
    openChat()
    await waitFor(() => expect(createRequestCount).toBe(1))
    fireEvent.change(screen.getByRole('textbox', { name: /pregunta/i }), {
      target: { value: 'Borrador de la misma cuenta.' },
    })

    sessionStorage.setItem(
      SESSION_STORAGE_KEY,
      JSON.stringify({ access_token: refreshedToken }),
    )
    act(() => window.dispatchEvent(new Event(SESSION_CHANGE_EVENT)))

    expect(sessionStorage.getItem(authenticatedConversationKey('account-a-subject')))
      .toBe('account-a-conversation')
    expect(createRequestCount).toBe(1)
    expect(screen.getByRole('textbox', { name: /pregunta/i })).toHaveValue(
      'Borrador de la misma cuenta.',
    )
    fireEvent.submit(messageForm())
    expect(await screen.findByText('Respuesta después de renovar la sesión.')).toBeVisible()
    expect(messageAuthorization).toBe(`Bearer ${refreshedToken}`)
    expect(localStorage.getItem(storedConversationKey)).toBeNull()
  })

  it('does not render a foreign conversation rejected by authenticated ownership checks', async () => {
    setSession('account-b-subject')
    sessionStorage.setItem(
      authenticatedConversationKey('account-b-subject'),
      conversationId,
    )
    let authorization: string | null = null
    server.use(
      http.get(`*/api/v1/chat/conversations/${conversationId}`, ({ request }) => {
        authorization = request.headers.get('authorization')
        return HttpResponse.json(
          { code: 'NOT_FOUND', error: 'Conversation not found.' },
          { status: 404 },
        )
      }),
    )

    render(<Chatbot />)
    openChat()

    expect(await screen.findByRole('alert')).toHaveTextContent(/iniciar un nuevo chat/i)
    expect(screen.queryByText(priorUserMessage)).not.toBeInTheDocument()
    expect(screen.queryByText(priorAssistantMessage)).not.toBeInTheDocument()
    expect(authorization).toBe(`Bearer ${accessToken('account-b-subject')}`)
    expect(sessionStorage.getItem(authenticatedConversationKey('account-b-subject'))).toBeNull()
  })

  it('never adopts a legacy unscoped reference for an authenticated account', async () => {
    setSession('account-b-subject')
    localStorage.setItem(storedConversationKey, conversationId)
    let created = false
    let read = false
    server.use(
      http.get(`*/api/v1/chat/conversations/${conversationId}`, () => {
        read = true
        return HttpResponse.json(ownedConversation)
      }),
      http.post('*/api/v1/chat/conversations', ({ request }) => {
        expect(request.headers.get('authorization')).toBe(
          `Bearer ${accessToken('account-b-subject')}`,
        )
        created = true
        return HttpResponse.json({
          conversation: {
            ...createdConversation.conversation,
            id: 'account-b-conversation',
          },
        }, { status: 201 })
      }),
    )

    render(<Chatbot />)
    openChat()

    await waitFor(() => expect(created).toBe(true))
    expect(read).toBe(false)
    expect(localStorage.getItem(storedConversationKey)).toBeNull()
  })
})
