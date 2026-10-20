import { describe, expect, it } from 'vitest'
import { authenticationErrorMessage, reviewErrorMessage } from './messages'

describe('localized API messages', () => {
  it('maps authentication codes without exposing technical text', () => {
    expect(authenticationErrorMessage('INVALID_CREDENTIALS'))
      .toBe('El correo electrónico o la contraseña son incorrectos.')
    expect(authenticationErrorMessage('DUPLICATE_EMAIL'))
      .toBe('Ya existe una cuenta con ese correo electrónico.')
    expect(authenticationErrorMessage('UNKNOWN'))
      .toContain('No se pudo completar la autenticación')
  })

  it('maps review codes to Spanish user feedback', () => {
    expect(reviewErrorMessage('UNAUTHENTICATED'))
      .toBe('Iniciá sesión para dejar una reseña.')
    expect(reviewErrorMessage('REVIEW_ALREADY_EXISTS'))
      .toBe('Ya dejaste una reseña para este juego.')
    expect(reviewErrorMessage('UNKNOWN'))
      .toContain('No se pudo enviar la reseña')
  })
})
