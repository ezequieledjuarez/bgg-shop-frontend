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


export const cartMessages = {
  openCart: "Carrito",
  loading: "Cargando carrito...",
  loadErrorTitle: "No se pudo cargar el carrito",
  empty: "Tu carrito está vacío.",
  add: (name: string) => `Agregar ${name} al carrito`,
  adding: "Agregando...",
  updating: "Actualizando...",
  removing: "Quitando...",
  addSuccess: (name: string) => `${name} se agregó al carrito.`,
  addError: "No se pudo agregar el juego. Intentá nuevamente.",
  availableStock: (quantity: number) => `Disponibles: ${quantity}`,
  total: "Total del carrito",
  quantity: (name: string) => `Cantidad de ${name}`,
  updateQuantity: (name: string) => `Actualizar cantidad de ${name}`,
  remove: (name: string) => `Quitar ${name}`,
  updateError: "No se pudo actualizar la cantidad. Intentá nuevamente.",
  retry: "Reintentar",
  continueShopping: "Seguir comprando",
} as const

export function cartErrorMessage() {
  return "No se pudo completar la operación del carrito. Intentá nuevamente."
}


export function purchaseErrorMessage(code?: string) {
  switch (code) {
    case 'PAYMENTS_DISABLED':
      return 'Los pagos están temporalmente deshabilitados. Intentá nuevamente más tarde.'
    case 'INSUFFICIENT_STOCK':
      return 'No hay stock suficiente para completar la compra. Revisá tu carrito.'
    case 'EMPTY_CART':
      return 'Tu carrito está vacío. Agregá juegos antes de proceder al pago.'
    case 'UNAUTHENTICATED':
      return 'Iniciá sesión para continuar con tu compra.'
    case 'ADDRESS_REQUIRED':
      return 'Completá los datos de envío requeridos.'
    default:
      return 'No se pudo completar la operación. Intentá nuevamente.'
  }
}
