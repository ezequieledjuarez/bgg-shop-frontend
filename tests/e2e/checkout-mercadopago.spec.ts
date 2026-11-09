import { test, expect } from '@playwright/test'

const BASE_URL = 'http://localhost:3000'

const TEST_USER = {
  username: process.env.MP_USUARIO_BUYER || 'testuserbuy',
  password: process.env.MP_PASS_BUYER || 'testpassword',
}

const TEST_CARD = {
  number: '5031755734530604',
  cvv: '123',
  expiration: '11/30',
}

test.describe('Mercado Pago Checkout Sandbox', () => {
  test('Purchase flow with sandbox card', async ({ page }) => {
    // Go to base URL
    await page.goto(BASE_URL)

    // Register or Login
    await page.click('text=Iniciar sesión')
    await page.fill('input[name="username"]', TEST_USER.username)
    await page.fill('input[name="password"]', TEST_USER.password)
    await page.click('button[type="submit"]')

    // Navigate to checkout
    await page.goto(`${BASE_URL}/finalizar-compra`)

    // Fill shipping info
    await page.fill('#shipping-recipient', 'Test Recipient')
    await page.fill('#shipping-street', '123 Test St')
    await page.fill('#shipping-city', 'Buenos Aires')
    await page.fill('#shipping-postal_code', '1000')
    await page.fill('#shipping-phone', '1234567890')

    // Proceed to Mercado Pago
    await page.click('button:has-text("Continuar a Mercado Pago")')

    // Wait for redirection to Mercado Pago sandbox checkout
    await page.waitForURL(url => url.hostname.includes('sandbox.mercadopago.com') || url.hostname.includes('mercadopago.com'))

    // Fill card details in Mercado Pago iframe
    const frame = await page.frameLocator('iframe[name="mercadopago"]').frameLocator('iframe')
    await frame.fill('input[aria-label="Número de tarjeta"]', TEST_CARD.number)
    await frame.fill('input[aria-label="Código de seguridad"]', TEST_CARD.cvv)
    await frame.fill('input[aria-label="Fecha de expiración"]', TEST_CARD.expiration)

    // Confirm payment
    await frame.click('button:has-text("Pagar")')

    // Verify redirection back to the app with payment result
    await page.waitForURL(`${BASE_URL}/compra/resultado`)

    // Check for success message
    await expect(page.locator('text=¡Gracias por tu compra!')).toBeVisible()
  })
})
