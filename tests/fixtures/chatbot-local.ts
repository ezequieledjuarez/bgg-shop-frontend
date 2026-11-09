import type { Page, Route } from '@playwright/test'

export const chatbotConversationId = 'synthetic-chat-conversation'
export const storedChatbotConversationId = 'chatbot.conversationId'

export const syntheticProduct = {
  bgg_id: 990001,
  name: 'Juego Sintético del Bosque',
  release_year: 2024,
  min_players: 2,
  max_players: 4,
  playing_time_minutes: 45,
  min_age: 10,
  weight: 1.5,
  category: ['Estrategia sintética'],
  price: 12345,
  publisher: 'Editorial Sintética',
  image_url: '/media/portadas/synthetic-chat-product.webp',
  quantity: 7,
}

export type ChatReply = {
  answer: string
  sources?: { title: string; url?: string }[]
  recommendations?: typeof syntheticProduct[]
}

export type ChatRequestRecord = {
  method: string
  pathname: string
  body?: unknown
}

export type ChatbotLocalOptions = {
  storedConversationId?: string
  getConversationStatus?: number
  replies?: (ChatReply | { status: number })[]
}

function conversationPayload(id: string) {
  const timestamp = '2026-11-07T09:00:00Z'
  return {
    conversation: {
      id,
      created_at: timestamp,
      updated_at: timestamp,
      expires_at: '2026-12-07T09:00:00Z',
      messages: [],
    },
  }
}

async function fulfillJson(route: Route, status: number, body: unknown) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    body: JSON.stringify(body),
  })
}

/**
 * Installs deterministic local API responses before navigating to the app.
 * The network guard only permits loopback origins; all chatbot and other API
 * requests are fulfilled locally and never fall through to BFF/Core services.
 */
export async function installChatbotLocalFakes(
  page: Page,
  options: ChatbotLocalOptions = {},
) {
  const requests: ChatRequestRecord[] = []
  let replyIndex = 0
  const replies = options.replies ?? []
  const seededConversationId = options.storedConversationId

  await page.addInitScript(
    ({ key, id }) => {
      if (id) localStorage.setItem(key, id)
      else localStorage.removeItem(key)
    },
    { key: storedChatbotConversationId, id: seededConversationId ?? null },
  )

  // Block external hosts even if a future app change adds a third-party call.
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url())
    const isLoopback = url.hostname === 'localhost'
      || url.hostname === '127.0.0.1'
      || url.hostname === '::1'
    if (isLoopback) {
      await route.fallback()
      return
    }
    await route.abort('blockedbyclient')
  })

  // Keep the storefront's initial catalog deterministic and prevent any other
  // /api/v1 request from reaching a service.
  await page.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const { pathname } = url
    if (pathname === '/api/v1/products') {
      await fulfillJson(route, 200, {
        items: [syntheticProduct],
        page: 1,
        page_size: 100,
        total: 1,
        total_pages: 1,
      })
      return
    }
    if (pathname === '/api/v1/product-categories') {
      await fulfillJson(route, 200, ['Estrategia sintética'])
      return
    }
    await fulfillJson(route, 404, { code: 'NOT_FOUND', error: 'Synthetic local response.' })
  })

  // This catch-all intentionally handles every /api/v1/chat/** endpoint,
  // including unexpected methods and paths, so none can reach a live service.
  await page.route('**/api/v1/chat/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const { pathname } = url
    const method = request.method()
    let body: unknown
    if (method === 'POST' && pathname.endsWith('/messages')) {
      try {
        body = request.postDataJSON()
      } catch {
        body = undefined
      }
    }
    requests.push({ method, pathname, ...(body === undefined ? {} : { body }) })

    if (method === 'POST' && pathname === '/api/v1/chat/conversations') {
      await fulfillJson(route, 201, conversationPayload(chatbotConversationId))
      return
    }

    const getConversationMatch = pathname.match(/^\/api\/v1\/chat\/conversations\/([^/]+)$/)
    if (method === 'GET' && getConversationMatch) {
      const status = options.getConversationStatus ?? 200
      if (status !== 200) {
        await fulfillJson(route, status, {
          code: status === 401 ? 'UNAUTHENTICATED' : 'NOT_FOUND',
          error: 'Synthetic conversation recovery response.',
        })
        return
      }
      await fulfillJson(route, 200, conversationPayload(decodeURIComponent(getConversationMatch[1])))
      return
    }

    if (method === 'POST' && /^\/api\/v1\/chat\/conversations\/[^/]+\/messages$/.test(pathname)) {
      const reply = replies[replyIndex++]
      if (!reply) {
        await fulfillJson(route, 503, {
          code: 'SERVICE_UNAVAILABLE',
          error: 'Synthetic local fallback.',
        })
        return
      }
      if ('status' in reply) {
        await fulfillJson(route, reply.status, {
          code: 'SERVICE_UNAVAILABLE',
          error: 'Synthetic transient service error.',
        })
        return
      }
      await fulfillJson(route, 200, {
        conversation_id: chatbotConversationId,
        answer: reply.answer,
        sources: reply.sources ?? [],
        recommendations: reply.recommendations ?? [],
        created_at: '2026-11-07T09:01:00Z',
      })
      return
    }

    await fulfillJson(route, 404, { code: 'NOT_FOUND', error: 'Synthetic chat route not found.' })
  })

  return { requests }
}
