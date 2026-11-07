import type { components, operations } from '../types/generated/bff-api'

type ConversationResponse =
  operations['createChatConversation']['responses'][201]['content']['application/json']
type StoredConversationResponse =
  operations['getChatConversation']['responses'][200]['content']['application/json']
type MessageRequest = components['schemas']['ChatMessageRequest']
type MessageResponse =
  operations['sendChatMessage']['responses'][200]['content']['application/json']

const apiBaseUrl = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

export class ChatApiError extends Error {
  constructor(public readonly status: number) {
    super('No se pudo completar la solicitud del asistente.')
    this.name = 'ChatApiError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isConversationResponse(
  value: unknown,
): value is ConversationResponse | StoredConversationResponse {
  if (!isRecord(value) || !isRecord(value.conversation)) return false

  const { conversation } = value
  return typeof conversation.id === 'string'
    && typeof conversation.created_at === 'string'
    && typeof conversation.updated_at === 'string'
    && typeof conversation.expires_at === 'string'
    && Array.isArray(conversation.messages)
    && conversation.messages.every((message) =>
      isRecord(message)
      && typeof message.id === 'string'
      && (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string'
      && typeof message.created_at === 'string'
      && Array.isArray(message.sources),
    )
}

function isMessageResponse(value: unknown): value is MessageResponse {
  return isRecord(value)
    && typeof value.conversation_id === 'string'
    && typeof value.answer === 'string'
    && Array.isArray(value.sources)
    && Array.isArray(value.recommendations)
    && typeof value.created_at === 'string'
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json() as unknown
  } catch {
    throw new Error('La respuesta del asistente no es válida.')
  }
}

export async function createConversation(signal?: AbortSignal): Promise<ConversationResponse> {
  const response = await fetch(`${apiBaseUrl}/chat/conversations`, {
    method: 'POST',
    credentials: 'include',
    headers: { Accept: 'application/json' },
    signal,
  })

  if (!response.ok) {
    throw new ChatApiError(response.status)
  }

  const payload = await readJson(response)
  if (!isConversationResponse(payload)) {
    throw new Error('La respuesta del asistente no es válida.')
  }
  return payload
}

export async function getConversation(
  conversationId: string,
  signal?: AbortSignal,
): Promise<StoredConversationResponse> {
  const response = await fetch(
    `${apiBaseUrl}/chat/conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'GET',
      credentials: 'include',
      cache: 'no-store',
      headers: { Accept: 'application/json' },
      signal,
    },
  )

  if (!response.ok) {
    throw new ChatApiError(response.status)
  }

  const payload = await readJson(response)
  if (!isConversationResponse(payload)) {
    throw new Error('La respuesta del asistente no es válida.')
  }
  return payload
}

export async function sendMessage(
  conversationId: string,
  request: MessageRequest,
  signal?: AbortSignal,
): Promise<MessageResponse> {
  const response = await fetch(
    `${apiBaseUrl}/chat/conversations/${encodeURIComponent(conversationId)}/messages`,
    {
      method: 'POST',
      credentials: 'include',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(request),
      signal,
    },
  )

  if (!response.ok) {
    throw new ChatApiError(response.status)
  }

  const payload = await readJson(response)
  if (!isMessageResponse(payload)) {
    throw new Error('La respuesta del asistente no es válida.')
  }
  return payload
}
