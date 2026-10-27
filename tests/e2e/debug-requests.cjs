const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const storagePath = 'tests/e2e/storageState.json';
  const storage = fs.existsSync(storagePath) ? JSON.parse(fs.readFileSync(storagePath)) : undefined;
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  // Inject sessionStorage from storageState.json for the app origin before navigation
  if (storage && storage.origins) {
    const originEntry = storage.origins.find(o => o.origin === 'http://localhost:3000');
    if (originEntry && originEntry.sessionStorage) {
      const pairs = originEntry.sessionStorage;
      await page.addInitScript(({ pairs }) => {
        for (const p of pairs) {
          try { sessionStorage.setItem(p.name, p.value); } catch (e) { /* ignore */ }
        }
      }, { pairs });
      console.log('Injected sessionStorage via addInitScript');
    }
  }

  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('/api/v1/admin/')) {
      console.log('REQUEST:', req.method(), url);
      try {
        console.log('  headers:', req.headers());
      } catch (e) {
        console.log('  headersError', e);
      }
    }
  });

  page.on('response', (res) => {
    const url = res.url();
    if (url.includes('/api/v1/admin/')) {
      console.log('RESPONSE:', res.status(), url);
    }
  });

  console.log('Navigating to admin products new form and submitting');
  await page.goto('http://localhost:3000/admin/products/new');
  // fill basic form fields if present
  try {
    await page.fill('#product-name', 'DBG Product ' + Date.now())
    await page.fill('#product-price', '123')
    await page.fill('#product-quantity', '5')
    await page.click('button[type=submit]')
  } catch (e) {
    console.log('Form fill/submit error', e.message || e)
  }
  // wait a bit for background requests
  await page.waitForTimeout(1000);

  const sess = await page.evaluate(() => sessionStorage.getItem('bgg-shop.session'))
  console.log('PAGE sessionStorage bgg-shop.session=', sess)

  // wait a bit more for background requests
  await page.waitForTimeout(4000);

  await browser.close();
  console.log('Done');
})();
