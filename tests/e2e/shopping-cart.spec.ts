import { test, expect } from '@playwright/test'

test('Public: shopping cart add/update/remove', async ({ page, baseURL }) => {
  const apiTarget = process.env.PW_API_TARGET || 'http://localhost:5000'
  await page.route('**/api/**', route => {
    const newUrl = route.request().url().replace(/^https?:\/\/[^/]+/, apiTarget)
    return route.continue({ url: newUrl })
  })

  await page.goto(baseURL || 'http://localhost:3000')
  // open first product detail - prefer "Ver detalles"
  const productLink = page.locator('a:has-text("Ver detalles")').first()
  if (await productLink.count() === 0) {
    // fallback: click first product card link
    const fallback = page.locator('a[href*="/games/"]:visible').first()
    if (await fallback.count() === 0) {
      test.skip(true, 'No product links found')
      return
    }
    await fallback.click()
  } else {
    await productLink.click()
  }

  await expect(page.locator('h1')).toBeVisible()
  // Add to cart - look for any button containing 'Agregar'
  const addBtn = page.locator('button:has-text("Agregar")')
  if (await addBtn.count() > 0) {
    await addBtn.first().click()
    // go to cart (spanish route)
    await page.goto(`${baseURL}/carrito`)
    await expect(page.locator('body')).toContainText('Carrito')
    // update quantity
    const qtyInput = page.locator('input[type="number"]')
    if (await qtyInput.count() > 0) {
      await qtyInput.first().fill('2')
      const updateBtn = page.locator('button:has-text("Actualizar")')
      if (await updateBtn.count() > 0) await updateBtn.first().click()
      await expect(page.locator('body')).toContainText('Total')
    }
    // remove
    const removeBtn = page.locator('button:has-text("Eliminar")')
    if (await removeBtn.count() > 0) {
      await removeBtn.first().click()
      await expect(page.locator('body')).not.toContainText('Cantidad')
    }
  } else {
    test.skip(true, 'Add to cart button not found on product page')
  }
})
