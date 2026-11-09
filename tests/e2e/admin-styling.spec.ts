import { expect, test, type Page } from '@playwright/test'
import type { components } from '../../src/types/generated/bff-api'

const viewports = [
  { width: 1280, height: 720 },
  { width: 768, height: 1024 },
  { width: 375, height: 812 },
  { width: 320, height: 720 },
]

const adminDestinations: { path: string; heading: string | RegExp; label: string; errorState?: boolean; extraHeading?: string }[] = [
  { path: '/admin/products', heading: 'Productos (Admin)', label: 'Productos', errorState: true },
  { path: '/admin/promotions', heading: 'Promociones', label: 'Promociones', errorState: true },
  { path: '/admin/coupons', heading: 'Cupones', label: 'Cupones', errorState: true },
  { path: '/admin/gift-cards', heading: 'Generar gift card', label: 'Gift cards', errorState: false },
  { path: '/admin/audit', heading: 'Historial de auditoría', label: 'Historial de auditoría', errorState: true },
  { path: '/admin/sales', heading: 'Métricas de ventas', label: 'Ventas', errorState: true },
  { path: '/admin/reviews', heading: 'Moderación de reseñas', label: 'Reseñas', errorState: true },
  { path: '/admin/users', heading: 'Administración de usuarios', label: 'Usuarios', errorState: true },
  { path: '/admin/products/new', heading: /producto/i, label: 'Productos' },
  { path: '/admin/products/902014', heading: /producto/i, label: 'Productos', extraHeading: 'Ajustar inventario' },
  { path: '/admin/promotions/new', heading: 'Crear promoción', label: 'Promociones' },
  { path: '/admin/coupons/new', heading: 'Crear cupón', label: 'Cupones' },
]

async function installSyntheticApi(page: Page) {
  await page.route('https://**/*', (route) => route.abort())
  await page.route('**/api/v1/auth/me', (route) => route.fulfill({
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
    contentType: 'application/json',
    body: JSON.stringify({ is_staff: false, is_superuser: true }),
  }))
  await page.route('**/api/v1/admin/**', (route) => route.fulfill({
    status: 502,
    contentType: 'application/json',
    body: JSON.stringify({ error: 'Respuesta sintética para el estado de error local.' }),
  }))
  await page.route('**/api/v1/admin/products/902014', (route) => route.fulfill({
    status: 200,
    contentType: 'application/json',
    body: JSON.stringify(product),
  }))
  await page.addInitScript(() => {
    sessionStorage.setItem('bgg-shop.session', JSON.stringify({ access_token: 'synthetic-style-bearer' }))
  })
}

function contrastRatio(foreground: string, background: string) {
  const luminance = (color: string) => {
    const channels = color.match(/\d+(?:\.\d+)?/g)?.slice(0, 3).map(Number)
    if (!channels || channels.length !== 3) throw new Error(`Unexpected computed color: ${color}`)
    const linear = channels.map((channel) => {
      const value = channel / 255
      return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
    })
    return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722
  }
  const values = [luminance(foreground), luminance(background)].sort((first, second) => second - first)
  return (values[0] + 0.05) / (values[1] + 0.05)
}

for (const viewport of viewports) {
  test(`all admin modules remain usable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await installSyntheticApi(page)
    await page.setViewportSize(viewport)

    for (const destination of adminDestinations) {
      await page.goto(destination.path)
      const navigation = page.getByRole('navigation', { name: 'Navegación de administración' })
      await expect(navigation).toBeVisible()
      await expect(page.getByRole('heading', { name: destination.heading })).toBeVisible()
      if (destination.extraHeading) await expect(page.getByRole('heading', { name: destination.extraHeading })).toBeVisible()
      await expect(navigation.getByRole('link', { name: destination.label })).toHaveAttribute('aria-current', 'page')
      if (destination.errorState) await expect(page.getByRole('alert').first()).toBeVisible()

      const layout = await page.evaluate(() => {
        const documentWidth = document.documentElement.scrollWidth
        const viewportWidth = document.documentElement.clientWidth
        const shell = document.querySelector('.admin-shell')?.getBoundingClientRect()
        const nav = document.querySelector('.admin-navigation')?.getBoundingClientRect()
        const content = document.querySelector('.admin-content')?.getBoundingClientRect()
        const contentElement = document.querySelector('.admin-content')
        const clippedActions = contentElement instanceof HTMLElement
          ? Array.from(contentElement.querySelectorAll('a, button')).filter((action) => {
            if (!(action instanceof HTMLElement) || action.closest('[role="region"]')) return false
            const rect = action.getBoundingClientRect()
            return rect.width > 0 && (rect.left < content!.left - 1 || rect.right > content!.right + 1)
          }).length
          : Number.POSITIVE_INFINITY
        return {
          documentWidth,
          viewportWidth,
          shellRight: shell?.right ?? Number.POSITIVE_INFINITY,
          navWidth: nav?.width ?? 0,
          contentWidth: content?.width ?? 0,
          clippedActions,
        }
      })
      expect(layout.documentWidth).toBeLessThanOrEqual(layout.viewportWidth)
      expect(layout.shellRight).toBeLessThanOrEqual(layout.viewportWidth + 1)
      expect(layout.navWidth).toBeGreaterThan(0)
      expect(layout.contentWidth).toBeGreaterThan(0)
      expect(layout.clippedActions).toBe(0)
    }

    await page.goto('/admin/products')
    await expect(page.getByRole('link', { name: 'Crear producto' })).toBeVisible()
    await expect(page.getByRole('alert')).toBeVisible()
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    const focusStyle = await page.evaluate(() => {
      const active = document.activeElement
      return active instanceof HTMLElement ? {
        isVisibleFocus: active.matches(':focus-visible'),
        outlineStyle: getComputedStyle(active).outlineStyle,
        outlineColor: getComputedStyle(active).outlineColor,
      } : null
    })
    expect(focusStyle?.isVisibleFocus).toBe(true)
    expect(focusStyle?.outlineStyle).toBe('solid')

    const contrast = await page.evaluate(() => {
      const currentLink = document.querySelector('.admin-navigation a[aria-current="page"]')
      const heading = document.querySelector('.admin-content h1')
      const primary = document.querySelector('.admin-content a.primary-button')
      const nav = document.querySelector('.admin-navigation')
      const content = document.querySelector('.admin-content')
      const alert = document.querySelector('.admin-content [role="alert"]')
      const focused = document.activeElement
      if (!(currentLink instanceof HTMLElement) || !(heading instanceof HTMLElement)
        || !(primary instanceof HTMLElement) || !(nav instanceof HTMLElement) || !(content instanceof HTMLElement)
        || !(alert instanceof HTMLElement) || !(focused instanceof HTMLElement)) return null
      const navStyle = getComputedStyle(currentLink)
      const headingStyle = getComputedStyle(heading)
      const primaryStyle = getComputedStyle(primary)
      const navSurface = getComputedStyle(nav)
      const contentSurface = getComputedStyle(content)
      const alertStyle = getComputedStyle(alert)
      const focusStyle = getComputedStyle(focused)
      return {
        navText: navStyle.color,
        navBackground: navStyle.backgroundColor,
        headingText: headingStyle.color,
        contentBackground: contentSurface.backgroundColor,
        primaryText: primaryStyle.color,
        primaryBackground: primaryStyle.backgroundColor,
        navigationBorder: getComputedStyle(nav).borderColor,
        surface: navSurface.backgroundColor,
        alertText: alertStyle.color,
        alertBackground: alertStyle.backgroundColor,
        alertBorder: alertStyle.borderLeftColor,
        focusOutline: focusStyle.outlineColor,
        focusAdjacentBackground: navSurface.backgroundColor,
      }
    })
    expect(contrast).not.toBeNull()
    const measured = {
      activeNavigation: contrastRatio(contrast!.navText, contrast!.navBackground),
      heading: contrastRatio(contrast!.headingText, contrast!.contentBackground),
      primaryAction: contrastRatio(contrast!.primaryText, contrast!.primaryBackground),
      navigationBoundary: contrastRatio(contrast!.navigationBorder, contrast!.surface),
      errorText: contrastRatio(contrast!.alertText, contrast!.alertBackground),
      errorBoundary: contrastRatio(contrast!.alertBorder, contrast!.alertBackground),
      keyboardFocus: contrastRatio(contrast!.focusOutline, contrast!.focusAdjacentBackground),
    }
    if (viewport.width === 1280) {
      console.info('Computed admin contrast ratios (browser):', JSON.stringify(measured), JSON.stringify(contrast))
    }
    expect(measured.activeNavigation).toBeGreaterThanOrEqual(4.5)
    expect(measured.heading).toBeGreaterThanOrEqual(4.5)
    expect(measured.primaryAction).toBeGreaterThanOrEqual(4.5)
    expect(measured.navigationBoundary).toBeGreaterThanOrEqual(3)
    expect(measured.errorText).toBeGreaterThanOrEqual(4.5)
    expect(measured.errorBoundary).toBeGreaterThanOrEqual(3)
    expect(measured.keyboardFocus).toBeGreaterThanOrEqual(3)
  })
}

const longName = `Synthetic game ${'wide-content-'.repeat(12)}`
const product: components['schemas']['Product'] = {
  bgg_id: 902014,
  name: longName,
  release_year: 2026,
  min_players: 2,
  max_players: 4,
  playing_time_minutes: 45,
  min_age: 8,
  weight: 1.75,
  category: ['Strategy'],
  price: 2500,
  quantity: 3,
  publisher: 'Synthetic publisher',
  image_url: '/synthetic.webp',
}
const productPage: components['schemas']['AdminProductPage'] = {
  items: [product],
  page: 1,
  page_size: 50,
  total: 1,
  total_pages: 1,
}

for (const viewport of viewports) {
  test(`wide products remain in a labelled keyboard-scroll region at ${viewport.width}px`, async ({ page }) => {
    await installSyntheticApi(page)
    await page.route('**/api/v1/admin/products*', (route) => route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(productPage),
    }))
    await page.setViewportSize(viewport)
    await page.goto('/admin/products')

    const region = page.getByRole('region', { name: /tabla de productos, desplazamiento horizontal disponible/i })
    await expect(region).toBeVisible()
    await expect(region.getByRole('table', { name: 'Productos' })).toBeVisible()
    await expect(page.getByRole('cell', { name: longName })).toBeVisible()
    await expect(region).toHaveAttribute('tabindex', '0')
    let regionReachedByTab = false
    for (let tab = 0; tab < 32 && !regionReachedByTab; tab += 1) {
      await page.keyboard.press('Tab')
      regionReachedByTab = await region.evaluate((element) => document.activeElement === element)
    }
    expect(regionReachedByTab).toBe(true)
    expect(await region.evaluate((element) => element.matches(':focus-visible'))).toBe(true)
    const scrollMetrics = await region.evaluate((element) => {
      const availableScroll = element.scrollWidth - element.clientWidth
      element.scrollLeft = element.scrollWidth
      return {
        availableScroll,
        localScroll: element.scrollLeft,
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }
    })
    if (viewport.width <= 375) {
      expect(scrollMetrics.availableScroll).toBeGreaterThan(0)
      expect(scrollMetrics.localScroll).toBeGreaterThan(0)
    }
    expect(scrollMetrics.documentWidth).toBeLessThanOrEqual(scrollMetrics.viewportWidth)
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width)
  })
}
