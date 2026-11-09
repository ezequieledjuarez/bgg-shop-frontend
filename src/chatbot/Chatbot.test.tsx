import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import Chatbot from './Chatbot'

const conversation = {
  conversation: {
    id: 'conversation-test',
    created_at: '2026-11-07T08:00:00Z',
    updated_at: '2026-11-07T08:00:00Z',
    expires_at: '2026-12-07T08:00:00Z',
    messages: [],
  },
}

const reply = {
  conversation_id: 'conversation-test',
  answer: 'Tenemos juegos de estrategia para distintos grupos.',
  sources: [{ title: 'Guía de juegos', url: '/ayuda/guia-de-juegos' }],
  recommendations: [],
  created_at: '2026-11-07T08:01:00Z',
}

const server = setupServer(
  http.post('*/api/v1/chat/conversations', () =>
    HttpResponse.json(conversation, { status: 201 }),
  ),
  http.post('*/api/v1/chat/conversations/conversation-test/messages', () =>
    HttpResponse.json(reply),
  ),
)

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }))
beforeEach(() => {
  window.history.replaceState({}, '', '/')
})
afterEach(() => {
  server.resetHandlers()
  localStorage.clear()
  sessionStorage.clear()
})
afterAll(() => server.close())

function openChat() {
  fireEvent.click(screen.getByRole('button', { name: /chat|asistente/i }))
}

function messageForm() {
  const textbox = screen.getByRole('textbox', { name: /mensaje|pregunta|consulta/i })
  const form = textbox.closest('form')
  expect(form).not.toBeNull()
  return form as HTMLFormElement
}

describe('Store chatbot accessibility', () => {
  it('starts closed and opens and closes from its accessible floating launcher', async () => {
    render(<Chatbot />)

    const launcher = screen.getByRole('button', { name: /chat|asistente/i })
    expect(launcher).toBeVisible()
    expect(launcher.tagName).toBe('BUTTON')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()

    fireEvent.click(launcher)

    expect(await screen.findByRole('textbox', { name: /mensaje|pregunta|consulta/i })).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(/\S/)
    expect(screen.getByRole('button', { name: /cerrar/i })).toBeVisible()

    fireEvent.click(screen.getByRole('button', { name: /cerrar/i }))
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
  })

  it('exposes an accessible assistant identity without redundantly naming its avatar', async () => {
    render(<Chatbot />)
    openChat()
    await screen.findByRole('textbox', { name: /mensaje|pregunta|consulta/i })

    const assistantLabel = screen.queryByText(/asistente/i)
    const namedAssistantAvatar = screen.queryByRole('img', { name: /asistente/i })

    expect(assistantLabel || namedAssistantAvatar).toBeTruthy()
    if (assistantLabel) {
      expect(namedAssistantAvatar).not.toBeInTheDocument()
    }
  })

  it('uses native keyboard-operable controls and submits the message form', async () => {
    render(<Chatbot />)
    openChat()

    const textbox = await screen.findByRole('textbox', { name: /mensaje|pregunta|consulta/i })
    expect(textbox.tagName).toBe('TEXTAREA')
    fireEvent.change(textbox, { target: { value: '¿Qué juegos de estrategia recomiendan?' } })

    const form = messageForm()
    const sendButton = screen.getByRole('button', { name: /enviar/i })
    expect(sendButton.tagName).toBe('BUTTON')

    // requestSubmit models the browser's native form submission path (including Enter).
    form.requestSubmit()

    expect(await screen.findByText(reply.answer)).toBeVisible()
    const sourceLink = screen.getByRole('link', { name: 'Guía de juegos' })
    expect(sourceLink).toHaveAttribute('href', '/ayuda/guia-de-juegos')
    expect(screen.getByRole('status')).toHaveTextContent(reply.answer)
  })

  it('shows unsafe source URLs as text rather than navigable links', async () => {
    server.use(
      http.post('*/api/v1/chat/conversations/conversation-test/messages', () =>
        HttpResponse.json({
          ...reply,
          sources: [
            { title: 'Fuente no segura', url: 'javascript:alert(1)' },
            { title: 'Fuente sin URL' },
          ],
        }),
      ),
    )

    render(<Chatbot />)
    openChat()
    const textbox = await screen.findByRole('textbox', { name: /mensaje|pregunta|consulta/i })
    fireEvent.change(textbox, { target: { value: '¿Qué recomiendan?' } })
    fireEvent.submit(messageForm())

    expect(await screen.findByText('Fuente no segura')).toBeVisible()
    expect(screen.getByText('Fuente sin URL')).toBeVisible()
    expect(screen.queryByRole('link', { name: 'Fuente no segura' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Fuente sin URL' })).not.toBeInTheDocument()
  })

  it('announces an in-progress request and then announces the response', async () => {
    let finishReply: (() => void) | undefined
    server.use(
      http.post('*/api/v1/chat/conversations/conversation-test/messages', async () => {
        await new Promise<void>((resolve) => {
          finishReply = resolve
        })
        return HttpResponse.json(reply)
      }),
    )

    render(<Chatbot />)
    openChat()
    const textbox = await screen.findByRole('textbox', { name: /mensaje|pregunta|consulta/i })
    fireEvent.change(textbox, { target: { value: '¿Qué juegos de estrategia recomiendan?' } })
    fireEvent.submit(messageForm())

    try {
      await waitFor(() => {
        expect(screen.getByRole('status')).toHaveTextContent(/cargando|generando|pensando|preparando/i)
      })
    } finally {
      finishReply?.()
    }

    expect(await screen.findByText(reply.answer)).toBeVisible()
    expect(screen.getByRole('status')).toHaveTextContent(reply.answer)
  })

  it('announces service failures and keeps an accessible recovery action', async () => {
    server.use(
      http.post('*/api/v1/chat/conversations/conversation-test/messages', () =>
        HttpResponse.json(
          { code: 'UPSTREAM_UNAVAILABLE', error: 'private upstream detail' },
          { status: 503 },
        ),
      ),
    )

    render(<Chatbot />)
    openChat()
    const textbox = await screen.findByRole('textbox', { name: /mensaje|pregunta|consulta/i })
    fireEvent.change(textbox, { target: { value: '¿Qué juegos de estrategia recomiendan?' } })
    fireEvent.submit(messageForm())

    expect(await screen.findByRole('alert')).toHaveTextContent(/\S/)
    expect(screen.getByRole('alert')).not.toHaveTextContent('private upstream detail')
    expect(screen.getByRole('button', { name: /reintentar|intentar de nuevo/i })).toBeVisible()
  })
})
