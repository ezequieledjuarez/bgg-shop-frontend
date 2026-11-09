import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import type { components } from '../types/generated/bff-api'
import { ChatApiError, createConversation, getConversation, sendMessage } from './api'
import './Chatbot.css'

type Product = components['schemas']['Product']
type Source = components['schemas']['ChatSource']
type StoredMessage = components['schemas']['ChatMessage']

type UserMessage = {
  key: string
  role: 'user'
  content: string
}

type AssistantMessage = {
  key: string
  role: 'assistant'
  content: string
  sources: Source[]
  recommendations: Product[]
}

type DisplayMessage = UserMessage | AssistantMessage

const storedConversationKey = 'chatbot.conversationId'

const formatRecommendationPrice = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
})

function getSafeSourceHref(url: string | undefined): string | null {
  if (!url) return null

  try {
    const parsedUrl = new URL(url, window.location.href)
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') return null
    if (parsedUrl.username || parsedUrl.password) return null

    const isRootRelative = url.startsWith('/') && !url.startsWith('//')
    const isAbsoluteHttp = /^https?:\/\//i.test(url)
    if (!isRootRelative && !isAbsoluteHttp) return null
    if (isRootRelative && parsedUrl.origin !== window.location.origin) return null

    return isRootRelative ? url : parsedUrl.href
  } catch {
    return null
  }
}

function getStoredConversationId(): string | null {
  try {
    const conversationId = localStorage.getItem(storedConversationKey)
    return conversationId?.trim() ? conversationId : null
  } catch {
    return null
  }
}

function mapStoredMessage(message: StoredMessage): DisplayMessage {
  if (message.role === 'user') {
    return { key: message.id, role: 'user', content: message.content }
  }
  return {
    key: message.id,
    role: 'assistant',
    content: message.content,
    sources: message.sources,
    recommendations: [],
  }
}

function RecommendationCard({ product }: { product: Product }) {
  const hasPlayerRange = Number.isFinite(product.min_players) && Number.isFinite(product.max_players)
  const playerCount = hasPlayerRange
    ? product.min_players === product.max_players
      ? `${product.min_players} ${product.min_players === 1 ? 'jugador' : 'jugadores'}`
      : `${product.min_players}–${product.max_players} jugadores`
    : null

  return (
    <article className="chatbot-recommendation">
      {typeof product.image_url === 'string' && product.image_url.length > 0 && (
        <img
          className="chatbot-recommendation-image"
          src={product.image_url}
          alt={`Portada de ${product.name}`}
          loading="lazy"
        />
      )}
      <h3>{product.name}</h3>
      <dl className="chatbot-recommendation-facts">
        {Array.isArray(product.category) && product.category.length > 0 && (
          <div>
            <dt>Categoría</dt>
            <dd>{product.category.join(', ')}</dd>
          </div>
        )}
        {playerCount !== null && (
          <div>
            <dt>Jugadores</dt>
            <dd>{playerCount}</dd>
          </div>
        )}
        {Number.isFinite(product.playing_time_minutes) && (
          <div>
            <dt>Duración</dt>
            <dd>{product.playing_time_minutes} minutos</dd>
          </div>
        )}
        {Number.isFinite(product.price) && (
          <div>
            <dt>Precio</dt>
            <dd>{formatRecommendationPrice.format(product.price)}</dd>
          </div>
        )}
        {Number.isFinite(product.release_year) && (
          <div>
            <dt>Año</dt>
            <dd>{product.release_year}</dd>
          </div>
        )}
        {typeof product.publisher === 'string' && product.publisher.length > 0 && (
          <div>
            <dt>Editorial</dt>
            <dd>{product.publisher}</dd>
          </div>
        )}
      </dl>
    </article>
  )
}

function Chatbot() {
  const [isOpen, setIsOpen] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<DisplayMessage[]>([])
  const [messageDraft, setMessageDraft] = useState('')
  const [announcement, setAnnouncement] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loadingConversation, setLoadingConversation] = useState(false)
  const [canStartNewConversation, setCanStartNewConversation] = useState(false)
  const [sendingMessage, setSendingMessage] = useState(false)
  const launcherRef = useRef<HTMLButtonElement>(null)
  const messageInputRef = useRef<HTMLTextAreaElement>(null)
  const requestControllerRef = useRef<AbortController | null>(null)
  const nextMessageKeyRef = useRef(0)

  useEffect(() => () => {
    requestControllerRef.current?.abort()
  }, [])

  useEffect(() => {
    if (isOpen) messageInputRef.current?.focus()
  }, [isOpen])

  async function startConversation() {
    requestControllerRef.current?.abort()
    const controller = new AbortController()
    requestControllerRef.current = controller
    setLoadingConversation(true)
    setCanStartNewConversation(false)
    setError(null)
    setConversationId(null)
    setMessages([])
    setAnnouncement('Iniciando conversación...')

    try {
      const result = await createConversation(controller.signal)
      if (controller.signal.aborted) return
      setConversationId(result.conversation.id)
      try {
        localStorage.setItem(storedConversationKey, result.conversation.id)
      } catch {
        setError('No se pudo guardar la referencia del chat en este dispositivo.')
      }
      setAnnouncement('Puedes preguntarme sobre juegos y productos de la tienda.')
    } catch {
      if (!controller.signal.aborted) {
        setError('No se pudo iniciar el chat. Inténtalo de nuevo.')
        setAnnouncement('')
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null
        setLoadingConversation(false)
      }
    }
  }

  async function loadConversation(storedId: string) {
    requestControllerRef.current?.abort()
    const controller = new AbortController()
    requestControllerRef.current = controller
    setLoadingConversation(true)
    setCanStartNewConversation(false)
    setConversationId(null)
    setMessages([])
    setError(null)
    setAnnouncement('Cargando la conversación...')

    try {
      const result = await getConversation(storedId, controller.signal)
      if (controller.signal.aborted) return
      if (result.conversation.id !== storedId) {
        throw new Error('La respuesta del asistente no es válida.')
      }
      setConversationId(storedId)
      setMessages(result.conversation.messages.map(mapStoredMessage))
      try {
        localStorage.setItem(storedConversationKey, storedId)
      } catch {
        setError('No se pudo guardar la referencia del chat en este dispositivo.')
      }
      setAnnouncement('Conversación cargada.')
    } catch (caught) {
      if (controller.signal.aborted) return
      setConversationId(null)
      setMessages([])
      setAnnouncement('')
      if (caught instanceof ChatApiError && (caught.status === 401 || caught.status === 404)) {
        try {
          localStorage.removeItem(storedConversationKey)
        } catch {
          // Keep the recovery action available even when browser storage is unavailable.
        }
        setCanStartNewConversation(true)
        setError('No se pudo recuperar el chat guardado. Puedes iniciar un nuevo chat.')
      } else {
        setError('No se pudo cargar el chat guardado. Inténtalo de nuevo.')
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null
        setLoadingConversation(false)
      }
    }
  }

  function openChat() {
    setIsOpen(true)
    setConversationId(null)
    setMessages([])
    setMessageDraft('')
    setError(null)
    setCanStartNewConversation(false)
    const storedId = getStoredConversationId()
    if (storedId) {
      void loadConversation(storedId)
    } else {
      void startConversation()
    }
  }

  function closeChat() {
    requestControllerRef.current?.abort()
    requestControllerRef.current = null
    setIsOpen(false)
    setConversationId(null)
    setMessages([])
    setMessageDraft('')
    setAnnouncement('')
    setError(null)
    setCanStartNewConversation(false)
    setLoadingConversation(false)
    setSendingMessage(false)
    launcherRef.current?.focus()
  }

  async function submitMessage() {
    const message = messageDraft.trim()
    if (!conversationId || !message || sendingMessage || loadingConversation) return

    const controller = new AbortController()
    requestControllerRef.current?.abort()
    requestControllerRef.current = controller
    setSendingMessage(true)
    setError(null)
    setAnnouncement('Preparando una respuesta...')

    try {
      const result = await sendMessage(conversationId, { message }, controller.signal)
      if (controller.signal.aborted) return
      setMessages((currentMessages) => [
        ...currentMessages,
        { key: `local-${nextMessageKeyRef.current++}`, role: 'user', content: message },
        {
          key: `local-${nextMessageKeyRef.current++}`,
          role: 'assistant',
          content: result.answer,
          sources: result.sources,
          recommendations: result.recommendations,
        },
      ])
      setMessageDraft('')
      setAnnouncement(`Respuesta del asistente: ${result.answer}`)
    } catch {
      if (!controller.signal.aborted) {
        setError('No se pudo enviar tu mensaje. Puedes intentarlo de nuevo.')
        setAnnouncement('')
      }
    } finally {
      if (requestControllerRef.current === controller) {
        requestControllerRef.current = null
        setSendingMessage(false)
      }
    }
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void submitMessage()
  }

  function retry() {
    if (conversationId) {
      void submitMessage()
    } else {
      const storedId = getStoredConversationId()
      if (storedId) {
        void loadConversation(storedId)
      } else {
        void startConversation()
      }
    }
  }

  return (
    <div className="chatbot">
      {isOpen && (
        <section className="chatbot-panel" aria-labelledby="chatbot-title">
          <header className="chatbot-header">
            <img className="chatbot-avatar" src="/media/meeple/meeple.svg" alt="" aria-hidden="true" />
            <div className="chatbot-heading">
              <h2 id="chatbot-title">Asistente de Meeple</h2>
              <p>Ayuda sobre juegos y productos</p>
            </div>
            <button className="chatbot-close" type="button" onClick={closeChat} aria-label="Cerrar chat">
              <span aria-hidden="true">×</span>
            </button>
          </header>

          <div className="chatbot-content">
            <div className="chatbot-messages" aria-label="Conversación">
              {messages.length === 0 ? (
                <p className="chatbot-empty">
                  ¡Hola! Puedo ayudarte a encontrar juegos y responder preguntas sobre la tienda.
                </p>
              ) : (
                <ol className="chatbot-message-list">
                  {messages.map((message) => (
                    <li className={`chatbot-message chatbot-message-${message.role}`} key={message.key}>
                      {message.role === 'assistant' && (
                        <span className="chatbot-message-speaker">Asistente</span>
                      )}
                      <p>{message.content}</p>
                      {message.role === 'assistant' && message.sources.length > 0 && (
                        <ul className="chatbot-sources" aria-label="Fuentes">
                          {message.sources.map((source, index) => {
                            const href = getSafeSourceHref(source.url)
                            return (
                              <li key={`${source.title}-${source.url ?? ''}-${index}`}>
                                {href ? <a href={href}>{source.title}</a> : source.title}
                              </li>
                            )
                          })}
                        </ul>
                      )}
                      {message.role === 'assistant' && message.recommendations.length > 0 && (
                        <ul className="chatbot-recommendations" aria-label="Productos recomendados">
                          {message.recommendations.map((product) => (
                            <li key={product.bgg_id}>
                              <RecommendationCard product={product} />
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <p className="chatbot-status" role="status" aria-live="polite" aria-atomic="true">
              {announcement}
            </p>
            {error && (
              <div className="chatbot-error" role="alert">
                <p>{error}</p>
                <button
                  type="button"
                  onClick={canStartNewConversation ? () => void startConversation() : retry}
                  disabled={loadingConversation || sendingMessage}
                >
                  {canStartNewConversation ? 'Iniciar un nuevo chat' : 'Reintentar'}
                </button>
              </div>
            )}

            <form className="chatbot-form" onSubmit={handleSubmit}>
              <label htmlFor="chatbot-message">Escribe tu pregunta</label>
              <textarea
                id="chatbot-message"
                ref={messageInputRef}
                name="message"
                value={messageDraft}
                onChange={(event) => setMessageDraft(event.target.value)}
                placeholder="¿Qué juego me recomiendan?"
                maxLength={2000}
                required
                disabled={sendingMessage}
              />
              <div className="chatbot-form-footer">
                <span>Máximo 2000 caracteres</span>
                <button
                  type="submit"
                  disabled={!conversationId || loadingConversation || sendingMessage || !messageDraft.trim()}
                >
                  {sendingMessage ? 'Enviando…' : 'Enviar'}
                </button>
              </div>
            </form>
          </div>
        </section>
      )}

      <button
        className="chatbot-launcher"
        type="button"
        ref={launcherRef}
        aria-label={isOpen ? 'Minimizar chat del asistente' : 'Abrir chat del asistente'}
        aria-expanded={isOpen}
        onClick={isOpen ? closeChat : openChat}
      >
        <img src="/media/meeple/meeple.svg" alt="" aria-hidden="true" />
        <span>{isOpen ? 'Minimizar' : 'Chat'}</span>
      </button>
    </div>
  )
}

export default Chatbot
