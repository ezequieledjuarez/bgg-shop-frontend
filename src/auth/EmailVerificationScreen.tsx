import { useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import {
  clearCapturedVerificationToken,
  confirmEmailVerification,
  getCapturedVerificationToken,
  resendEmailVerification,
} from './emailVerification'
import type { VerificationOutcome } from './emailVerification'
import { verificationMessage } from '../ui/messages'
import { uiRoutes } from '../routing/routes'

type Phase = 'ready' | 'confirming' | 'verified' | 'unusable'

function navigate(path: string) {
  window.history.pushState({}, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

export function ResendVerificationForm({ initialEmail = '' }: { initialEmail?: string }) {
  const [email, setEmail] = useState(initialEmail)
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null)
  const [busy, setBusy] = useState(false)
  const inFlight = useRef(false)

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (inFlight.current) return
    inFlight.current = true
    setBusy(true)
    try {
      setOutcome(await resendEmailVerification(email))
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate>
      <div className="auth-field">
        <label htmlFor="verification-email">Correo para reenviar la verificación</label>
        <input id="verification-email" type="email" autoComplete="email" value={email} required
          onChange={(event) => { setEmail(event.target.value); setOutcome(null) }} />
      </div>
      {outcome && (
        <p role={outcome.kind === 'ok' ? 'status' : 'alert'}>{verificationMessage('resend', outcome)}</p>
      )}
      <button className="auth-submit" type="submit" disabled={busy}>
        {busy ? 'Esperá…' : 'Reenviar correo de verificación'}
      </button>
    </form>
  )
}

export function EmailVerificationScreen({ onBack }: { onBack: () => void }) {
  const [token] = useState(() => getCapturedVerificationToken())
  const [phase, setPhase] = useState<Phase>(token ? 'ready' : 'unusable')
  const [outcome, setOutcome] = useState<VerificationOutcome | null>(null)
  const inFlight = useRef(false)

  useEffect(() => () => { if (!inFlight.current) clearCapturedVerificationToken() }, [])

  const confirm = async () => {
    if (!token || inFlight.current) return
    inFlight.current = true
    setPhase('confirming')
    try {
      const result = await confirmEmailVerification(token)
      setOutcome(result)
      if (result.kind === 'ok') {
        clearCapturedVerificationToken()
        setPhase('verified')
      } else if (result.kind === 'invalid') {
        clearCapturedVerificationToken()
        setPhase('unusable')
      } else {
        setPhase('ready')
      }
    } finally {
      inFlight.current = false
    }
  }

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="verify-title">
        <button className="auth-back" type="button" onClick={onBack}>← Volver al catálogo</button>
        <p className="auth-eyebrow">BGG Shop</p>
        <h1 id="verify-title">Verificá tu correo electrónico</h1>

        {(phase === 'ready' || phase === 'confirming') && (
          <>
            <p className="auth-intro">Confirmá que este correo te pertenece para activar tu cuenta.</p>
            {outcome && outcome.kind !== 'ok' && <p role="alert">{verificationMessage('confirm', outcome)}</p>}
            <button className="auth-submit" type="button" onClick={confirm} disabled={phase === 'confirming'}>
              {phase === 'confirming' ? 'Confirmando…' : 'Confirmar mi correo'}
            </button>
          </>
        )}

        {phase === 'verified' && (
          <div className="auth-success" role="status">
            <strong>{verificationMessage('confirm', { kind: 'ok' })}</strong>
            <p>
              <button type="button" onClick={() => navigate(uiRoutes.login)}>Iniciar sesión</button>
            </p>
          </div>
        )}

        {phase === 'unusable' && (
          <>
            <p role="alert">{verificationMessage('confirm', { kind: 'invalid' })}</p>
            <ResendVerificationForm />
          </>
        )}
      </section>
    </main>
  )
}
