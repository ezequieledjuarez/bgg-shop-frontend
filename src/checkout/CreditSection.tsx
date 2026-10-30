import { useEffect, useRef, useState } from 'react'
import { SESSION_CHANGE_EVENT } from '../auth/session'
import { beginCreditAttempt, clearCreditAttempt, creditAttemptMayExist, CreditError, creditErrorMessage, getCredit, redeemCredit } from './credit'
import type { CreditBalance } from './credit'

export function CreditSection({ disabled, recoveryKey, onBusyChange }: { disabled: boolean; recoveryKey?: string; onBusyChange: (busy: boolean) => void }) {
  const [balance, setBalance] = useState<CreditBalance | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [redeeming, setRedeeming] = useState(false)
  const [uncertain, setUncertain] = useState(Boolean(recoveryKey))
  const [inputLocked, setInputLocked] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const key = useRef(recoveryKey)
  const inFlight = useRef(false)
  const sessionVersion = useRef(0)
  const balanceRequest = useRef<AbortController | null>(null)

  useEffect(() => {
    const handleSessionChange = () => {
      sessionVersion.current += 1
      balanceRequest.current?.abort()
      if (input.current) input.current.value = ''
      setBalance(null)
      setLoading(true)
      setLoadError(false)
      setError(null)
      setSuccess(false)
      setInputLocked(false)
      if (inFlight.current) {
        setUncertain(true)
        onBusyChange(true)
      }
      setRetry((value) => value + 1)
    }
    window.addEventListener(SESSION_CHANGE_EVENT, handleSessionChange)
    return () => window.removeEventListener(SESSION_CHANGE_EVENT, handleSessionChange)
  }, [onBusyChange])

  useEffect(() => {
    const controller = new AbortController()
    const version = sessionVersion.current
    balanceRequest.current = controller
    getCredit(controller.signal).then((result) => {
      if (controller.signal.aborted || version !== sessionVersion.current) return
      setBalance(result)
      setLoading(false)
    }).catch(() => {
      if (controller.signal.aborted || version !== sessionVersion.current) return
      setLoadError(true)
      setLoading(false)
    })
    return () => controller.abort()
  }, [retry])

  const redeem = async () => {
    const code = input.current?.value.trim()
    if (inFlight.current || disabled || loading) return
    if (!code) {
      setError('Ingresá el código de la gift card.')
      return
    }
    if (code.length > 64) {
      setError('El código de la gift card no puede superar 64 caracteres.')
      return
    }
    inFlight.current = true
    onBusyChange(true)
    setRedeeming(true)
    setError(null)
    setSuccess(false)
    let unresolved = true
    const version = sessionVersion.current
    let attempt: ReturnType<typeof beginCreditAttempt> | undefined
    try {
      attempt = beginCreditAttempt('redeem', key.current)
      key.current = attempt.key
      const result = await redeemCredit(code, attempt.key)
      if (version !== sessionVersion.current) return
      clearCreditAttempt(attempt)
      key.current = undefined
      setBalance(result)
      if (input.current) input.current.value = ''
      unresolved = false
      setUncertain(false)
      setInputLocked(false)
      setSuccess(true)
    } catch (reason) {
      if (version !== sessionVersion.current) return
      const unknown = !attempt ? creditAttemptMayExist(key.current) : !(reason instanceof CreditError) || (reason.uncertain && !(reason.preflightRejected && !attempt.previouslyUncertain))
      unresolved = unknown
      try {
        if (!unknown && attempt) {
          clearCreditAttempt(attempt)
          key.current = undefined
        }
        setUncertain(unknown)
        setInputLocked(unknown && !(reason instanceof CreditError && (reason.code === 'IDEMPOTENCY_CONFLICT' || reason.preflightRejected)))
        setError(creditErrorMessage(!unknown && reason instanceof CreditError && reason.uncertain ? new CreditError(reason.code, false) : reason))
      } catch (storageError) {
        unresolved = true
        setUncertain(true)
        setError(creditErrorMessage(storageError))
      }
    } finally {
      inFlight.current = false
      onBusyChange(unresolved)
      setRedeeming(false)
    }
  }

  return <fieldset disabled={disabled || redeeming}>
    <legend>Crédito personal</legend>
    {loading ? <p role="status">Consultando saldo…</p> : loadError && !balance ? <>
      <p role="alert">No se pudo consultar tu saldo.</p>
      <button type="button" className="text-button" onClick={() => { setLoadError(false); setLoading(true); setRetry((value) => value + 1) }}>Reintentar saldo</button>
    </> : balance && <p>Saldo disponible: {new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(balance.balance))} ARS</p>}
    <label htmlFor="gift-card-code">Código de gift card
      <input id="gift-card-code" ref={input} type="password" autoComplete="off" readOnly={inputLocked} aria-invalid={Boolean(error)} aria-describedby={error ? 'gift-card-error' : undefined} />
    </label>
    <button type="button" className="text-button" disabled={loading} onClick={() => void redeem()}>{redeeming ? 'Canjeando…' : uncertain ? 'Reintentar canje' : 'Canjear'}</button>
    {error && <p id="gift-card-error" role="alert">{error}</p>}
    {uncertain && <p>Reingresá el mismo código y usá la misma cuenta para reintentar. Al cerrar la pestaña se pierde el intento.</p>}
    {success && <p role="status">Gift card canjeada.</p>}
  </fieldset>
}