import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'
import {
  chatbotConversationId,
  installChatbotLocalFakes,
  storedChatbotConversationId,
  syntheticProduct,
} from '../fixtures/chatbot-local'

async function openChatPanel(page: Page) {
  await page.goto('/')
  const launcher = page.getByRole('button', { name: 'Abrir chat del asistente' })
  await expect(launcher).toHaveAttribute('aria-expanded', 'false')
  await launcher.click()
  await expect(page.getByRole('heading', { name: 'Asistente de Meeple' })).toBeVisible()
}

async function openReadyChat(page: Page) {
  await openChatPanel(page)
  await expect(page.getByRole('status')).toContainText('Puedes preguntarme sobre juegos')
  await expect(page.getByRole('textbox', { name: 'Escribe tu pregunta' })).toBeFocused()
}

async function sendQuestion(page: Page, question: string) {
  const input = page.getByRole('textbox', { name: 'Escribe tu pregunta' })
  await input.fill(question)
  await expect(page.getByRole('button', { name: 'Enviar', exact: true })).toBeEnabled()
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
}

test('shows a grounded FAQ response with its approved source', async ({ page }) => {
  const { requests } = await installChatbotLocalFakes(page, {
    replies: [{
      answer: 'Podés solicitar un cambio dentro de los 30 días con el comprobante de compra.',
      sources: [{ title: 'Cambios y devoluciones', url: '/ayuda/cambios-y-devoluciones' }],
    }],
  })

  await openReadyChat(page)
  await sendQuestion(page, '¿Cuál es la política de cambios?')

  await expect(page.locator('.chatbot-message-assistant')
    .getByText('Podés solicitar un cambio dentro de los 30 días con el comprobante de compra.')).toBeVisible()
  const source = page.getByRole('link', { name: 'Cambios y devoluciones' })
  await expect(source).toBeVisible()
  await expect(source).toHaveAttribute('href', '/ayuda/cambios-y-devoluciones')
  await expect(page.getByRole('status')).toContainText('Podés solicitar un cambio')
  expect(requests.filter(({ pathname }) => pathname.endsWith('/messages'))).toHaveLength(1)
})

test('states an explicit refusal and a safe uncertainty fallback without recommendations', async ({ page }) => {
  await installChatbotLocalFakes(page, {
    replies: [
      { answer: 'No puedo ayudar con datos personales o información de pedidos. Puedo responder preguntas sobre juegos y políticas públicas de la tienda.' },
      { answer: 'No tengo información verificada para responder eso. Consultá al equipo de la tienda si necesitás confirmación.' },
    ],
  })

  await openReadyChat(page)
  await sendQuestion(page, '¿Cuál es el pedido privado de otra persona?')
  await expect(page.locator('.chatbot-message-assistant').last()).toContainText(/No puedo ayudar con datos personales/)
  await expect(page.getByRole('list', { name: 'Productos recomendados' })).toHaveCount(0)

  await sendQuestion(page, '¿Qué cambiará el precio del juego el año que viene?')
  await expect(page.locator('.chatbot-message-assistant').last()).toContainText(/No tengo información verificada/)
  await expect(page.getByRole('list', { name: 'Productos recomendados' })).toHaveCount(0)
})

test('shows only exact synthetic catalog facts and does not invent unsupported attributes', async ({ page }) => {
  await installChatbotLocalFakes(page, {
    replies: [{
      answer: 'El catálogo no indica si es cooperativo ni su nivel de dificultad; estos son los datos disponibles.',
      recommendations: [syntheticProduct],
    }],
  })

  await openChatPanel(page)
  await sendQuestion(page, '¿Es cooperativo y qué dificultad tiene?')

  const recommendations = page.getByRole('list', { name: 'Productos recomendados' })
  await expect(recommendations).toBeVisible()
  const card = recommendations.locator('article')
  await expect(card.getByRole('heading', { name: syntheticProduct.name })).toBeVisible()
  await expect(card.getByText('Estrategia sintética')).toBeVisible()
  await expect(card.getByText('2–4 jugadores')).toBeVisible()
  await expect(card.getByText('45 minutos')).toBeVisible()
  await expect(card.getByText('2024', { exact: true })).toBeVisible()
  await expect(card.getByText('Editorial Sintética')).toBeVisible()
  await expect(card.getByText(/12[.,\s]?345/)).toBeVisible()
  await expect(card.getByText(/cooperativo|dificultad/i)).toHaveCount(0)
})

for (const scenario of [
  { status: 404, description: 'expired or stale' },
  { status: 401, description: 'cross-owner or unauthorized' },
]) {
  test(`recovers from a ${scenario.description} saved conversation without exposing history`, async ({ page }) => {
    const { requests } = await installChatbotLocalFakes(page, {
      storedConversationId: 'synthetic-previous-conversation',
      getConversationStatus: scenario.status,
    })

    await openChatPanel(page)

    const alert = page.getByRole('alert')
    await expect(alert).toContainText('Puedes iniciar un nuevo chat.')
    await expect(page.getByText('synthetic-previous-conversation')).toHaveCount(0)
    await expect(page.getByRole('button', { name: 'Iniciar un nuevo chat' })).toBeVisible()
    expect(await page.evaluate((key) => localStorage.getItem(key), storedChatbotConversationId)).toBeNull()

    await page.getByRole('button', { name: 'Iniciar un nuevo chat' }).click()
    await expect(page.getByRole('textbox', { name: 'Escribe tu pregunta' })).toBeEnabled()
    expect(await page.evaluate((key) => localStorage.getItem(key), storedChatbotConversationId))
      .toBe(chatbotConversationId)
    expect(requests.map(({ method, pathname }) => `${method} ${pathname}`)).toEqual([
      'GET /api/v1/chat/conversations/synthetic-previous-conversation',
      'POST /api/v1/chat/conversations',
    ])
  })
}

test('offers an accessible retry after a transient safe error and resubmits the same question', async ({ page }) => {
  const { requests } = await installChatbotLocalFakes(page, {
    replies: [
      { status: 503 },
      { answer: 'El catálogo sintético confirma una ficha disponible.', recommendations: [syntheticProduct] },
    ],
  })

  await openReadyChat(page)
  await sendQuestion(page, '¿Qué juego aparece en el catálogo?')

  const alert = page.getByRole('alert')
  await expect(alert).toContainText('Puedes intentarlo de nuevo.')
  await expect(alert).not.toContainText('Synthetic transient')
  await expect(page.getByRole('button', { name: 'Reintentar' })).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar' }).click()

  await expect(page.getByRole('list', { name: 'Productos recomendados' })
    .getByRole('heading', { name: syntheticProduct.name })).toBeVisible()
  await expect(page.getByRole('alert')).toHaveCount(0)
  expect(requests.filter(({ pathname }) => pathname.endsWith('/messages')).map(({ body }) => body))
    .toEqual([
      { message: '¿Qué juego aparece en el catálogo?' },
      { message: '¿Qué juego aparece en el catálogo?' },
    ])
})

test('exposes launcher, input, live status, alert, and recommendations through accessible roles', async ({ page }) => {
  await installChatbotLocalFakes(page, {
    replies: [
      { status: 503 },
      { answer: 'Ficha de recomendación sintética.', recommendations: [syntheticProduct] },
    ],
  })

  await page.goto('/')
  const launcher = page.getByRole('button', { name: 'Abrir chat del asistente' })
  await expect(launcher).toHaveAttribute('aria-expanded', 'false')
  await launcher.click()
  await expect(page.getByRole('button', { name: 'Minimizar chat del asistente' }))
    .toHaveAttribute('aria-expanded', 'true')

  const input = page.getByRole('textbox', { name: 'Escribe tu pregunta' })
  await expect(input).toBeFocused()
  await expect(page.getByRole('status')).toContainText('Puedes preguntarme sobre juegos')
  await input.fill('Recomiéndame un juego sintético')
  await page.getByRole('button', { name: 'Enviar', exact: true }).click()
  await expect(page.getByRole('alert')).toBeVisible()
  await page.getByRole('button', { name: 'Reintentar' }).click()
  await expect(page.getByRole('list', { name: 'Productos recomendados' })).toBeVisible()
  await expect(page.getByRole('list', { name: 'Productos recomendados' })
    .getByRole('heading', { name: syntheticProduct.name })).toBeVisible()
})
