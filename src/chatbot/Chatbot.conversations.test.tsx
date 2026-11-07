import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Chatbot from './Chatbot'

const conversationId = 'owned-conversation-013'
const storedConversationKey = 'chatbot.conversationId'
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
})
