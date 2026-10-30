import { useState } from 'react'
import type { FormEvent } from 'react'
import type { components } from '../../types/generated/bff-api'
import apiFetch from '../../lib/apiClient'

type GiftCard = components['schemas']['AdminGiftCardCreateResponse']

const base = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:5000/api/v1'

export default function GiftCardForm() {
  const [amount, setAmount] = useState('')
  const [card, setCard] = useState<GiftCard | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [copied, setCopied] = useState(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (saving) return
    if (!/^[0-9]{1,10}(?:\.[0-9]{1,2})?$/.test(amount) || Number(amount) <= 0) {
      setError('Ingresá un importe válido mayor a cero, con hasta dos decimales.')
      return
    }
    setError(null)
    setSaving(true)
    try {
      const response = await apiFetch(`${base}/admin/gift-cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount } satisfies components['schemas']['AdminGiftCardCreateRequest']),
      })
      if (!response.ok) {
        setError(response.status === 403
          ? 'Necesitás permisos de administrador para generar tarjetas.'
          : response.status === 401
            ? 'Iniciá sesión para generar tarjetas.'
            : 'No se pudo confirmar la emisión. Verificá el resultado antes de volver a intentarlo.')
        return
      }
      setCard(await response.json() as GiftCard)
    } catch {
      setError('No se pudo confirmar la emisión. Verificá el resultado antes de volver a intentarlo.')
    } finally {
      setSaving(false)
    }
  }

  const copyCode = async () => {
    if (!card) return
    try {
      await navigator.clipboard.writeText(card.code)
      setCopied(true)
    } catch {
      setError('No se pudo copiar el código.')
    }
  }

  return (
    <main className="purchase-page" aria-labelledby="gift-card-title">
      <a href="/admin">← Volver a administración</a>
      <h1 id="gift-card-title">Generar gift card</h1>
      {card ? (
        <section className="purchase-form" aria-label="Tarjeta generada">
          <p>Tarjeta generada por {card.currency} {card.amount}.</p>
          <label htmlFor="gift-card-code">Código generado</label>
          <input id="gift-card-code" value={card.code} readOnly />
          <p>Este código no se mostrará nuevamente.</p>
          <button type="button" onClick={() => void copyCode()}>Copiar código</button>
          {copied && <p role="status">Código copiado.</p>}
          {error && <p role="alert">{error}</p>}
          <button type="button" className="primary-button" onClick={() => { setCard(null); setAmount(''); setError(null); setCopied(false) }}>Generar otra tarjeta</button>
        </section>
      ) : (
        <form className="purchase-form" onSubmit={submit} noValidate>
          <label htmlFor="gift-card-amount">Importe (ARS)</label>
          <input id="gift-card-amount" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} aria-invalid={Boolean(error)} />
          {error && <p role="alert">{error}</p>}
          <button className="primary-button" type="submit" disabled={saving}>{saving ? 'Generando…' : 'Generar tarjeta'}</button>
        </form>
      )}
    </main>
  )
}