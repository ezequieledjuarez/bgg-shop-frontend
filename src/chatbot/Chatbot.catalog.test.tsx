import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { http, HttpResponse } from 'msw'
import { setupServer } from 'msw/node'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import type { components } from '../types/generated/bff-api'
import Chatbot from './Chatbot'

const conversation = {
  conversation: {
    id: 'catalog-conversation',
    created_at: '2026-11-07T08:00:00Z',
    updated_at: '2026-11-07T08:00:00Z',
    expires_at: '2026-12-07T08:00:00Z',
    messages: [],
  },
}

const watergate: components['schemas']['Product'] = {
  bgg_id: 274364,
  name: 'Watergate',
  release_year: 2019,
  min_players: 2,
  max_players: 2,
  playing_time_minutes: 60,
  min_age: 12,
  weight: 2.25,
  category: ['Juegos de Estrategia'],
  price: 90000,
  publisher: 'Salt & Pepper Games',
  image_url: '/media/portadas/274364.webp',
  quantity: 10,
}

const server = setupServer(
  http.post('*/api/v1/chat/conversations', () =>
    HttpResponse.json(conversation, { status: 201 }),
  ),
  http.post('*/api/v1/chat/conversations/catalog-conversation/messages', () =>
    HttpResponse.json({
      conversation_id: 'catalog-conversation',
      answer: 'Encontré una opción del catálogo que puede interesarte.',
      sources: [],
      recommendations: [watergate],
      created_at: '2026-11-07T08:01:00Z',
    }),
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

async function openChatAndWaitUntilReady() {
  render(<Chatbot />)
  const launcher = screen.getByRole('button', { name: /abrir chat/i })
  expect(launcher).toHaveAttribute('aria-expanded', 'false')
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

  fireEvent.click(launcher)
  const textbox = await screen.findByRole('textbox', { name: /pregunta/i })
  await waitFor(() => {
    expect(screen.getByRole('status')).toHaveTextContent(
      'Puedes preguntarme sobre juegos y productos de la tienda.',
    )
  })
  return textbox
}

async function submitQuestion(question: string) {
  const textbox = screen.getByRole('textbox', { name: /pregunta/i })
  fireEvent.change(textbox, { target: { value: question } })
  const form = textbox.closest('form')
  expect(form).not.toBeNull()
  fireEvent.submit(form as HTMLFormElement)
}

describe('Store chatbot catalog recommendations', () => {
  it('renders recommendation facts from the BFF product fields', async () => {
    await openChatAndWaitUntilReady()
    await submitQuestion('¿Qué juego de estrategia para dos personas recomiendan?')

    expect(await screen.findByText('Encontré una opción del catálogo que puede interesarte.'))
      .toBeVisible()
    expect(screen.getByText('Watergate')).toBeVisible()
    expect(screen.getByText('Juegos de Estrategia')).toBeVisible()
    expect(screen.getByText(/90[.,\s]?000/)).toBeVisible()
  })

  it('asks for clarification when the requested criterion is unsupported', async () => {
    const clarification =
      'El catálogo no permite filtrar por si un juego es cooperativo. ¿Querés que busque por cantidad de jugadores o categoría?'
    server.use(
      http.post('*/api/v1/chat/conversations/catalog-conversation/messages', () =>
        HttpResponse.json({
          conversation_id: 'catalog-conversation',
          answer: clarification,
          sources: [],
          recommendations: [],
          created_at: '2026-11-07T08:01:00Z',
        }),
      ),
    )

    await openChatAndWaitUntilReady()
    await submitQuestion('Busco un juego cooperativo.')

    expect(await screen.findByText(clarification)).toBeVisible()
    expect(screen.queryByText(watergate.name)).not.toBeInTheDocument()
  })

  it('reports an empty catalog result without substituting a product', async () => {
    const noMatches = 'No encontré productos que coincidan con esos criterios.'
    server.use(
      http.post('*/api/v1/chat/conversations/catalog-conversation/messages', () =>
        HttpResponse.json({
          conversation_id: 'catalog-conversation',
          answer: noMatches,
          sources: [],
          recommendations: [],
          created_at: '2026-11-07T08:01:00Z',
        }),
      ),
    )

    await openChatAndWaitUntilReady()
    await submitQuestion('¿Qué juego de estrategia recomiendan?')

    expect(await screen.findByText(noMatches)).toBeVisible()
    expect(screen.queryByText(watergate.name)).not.toBeInTheDocument()
  })

  it('offers recovery after an unavailable catalog request and renders the retry result', async () => {
    let messageRequests = 0
    server.use(
      http.post('*/api/v1/chat/conversations/catalog-conversation/messages', () => {
        messageRequests += 1
        if (messageRequests === 1) {
          return HttpResponse.json(
            {
              code: 'SERVICE_UNAVAILABLE',
              error: 'El catálogo no está disponible en este momento.',
            },
            { status: 503 },
          )
        }

        return HttpResponse.json({
          conversation_id: 'catalog-conversation',
          answer: 'Encontré una opción del catálogo que puede interesarte.',
          sources: [],
          recommendations: [watergate],
          created_at: '2026-11-07T08:02:00Z',
        })
      }),
    )

    await openChatAndWaitUntilReady()
    await submitQuestion('¿Qué juego de estrategia recomiendan?')

    const error = await screen.findByRole('alert')
    expect(error).toHaveTextContent(/\S/)
    expect(error).not.toHaveTextContent('El catálogo no está disponible')
    const retry = screen.getByRole('button', { name: /reintentar/i })
    expect(retry).toBeVisible()

    fireEvent.click(retry)

    expect(await screen.findByText(watergate.name)).toBeVisible()
    expect(messageRequests).toBe(2)
  })
})
