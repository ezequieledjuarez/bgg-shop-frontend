export function authenticationErrorMessage(code?: string) {
  switch (code) {
    case 'INVALID_CREDENTIALS':
    case 'INVALID':
      return 'El correo electrónico o la contraseña son incorrectos.'
    case 'DUPLICATE_EMAIL':
    case 'EMAIL_EXISTS':
    case 'UNIQUE':
      return 'Ya existe una cuenta con ese correo electrónico.'
    default:
      return 'No se pudo completar la autenticación. Intentá nuevamente.'
  }
}

export function reviewErrorMessage(code?: string) {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 'Iniciá sesión para dejar una reseña.'
    case 'PRODUCT_NOT_FOUND':
      return 'No encontramos ese juego.'
    case 'REVIEW_ALREADY_EXISTS':
      return 'Ya dejaste una reseña para este juego.'
    case 'RATING_OUT_OF_RANGE':
      return 'La calificación debe estar entre 1 y 5.'
    case 'BODY_REQUIRED':
      return 'Escribí una reseña antes de enviarla.'
    case 'BODY_TOO_LONG':
      return 'La reseña no puede superar los 2000 caracteres.'
    default:
      return 'No se pudo enviar la reseña. Intentá nuevamente.'
  }
}
