const { chromium } = require('playwright');
const fs = require('fs');
(async () => {
  const storage = 'tests/e2e/storageState.json';
  const apiTarget = process.env.PW_API_TARGET || 'http://localhost:5000';
  const base = process.env.PLAYWRIGHT_BASEURL || 'http://localhost:3000';
  const browser = await chromium.launch();
  const context = await browser.newContext({ storageState: storage });
  const page = await context.newPage();
  await page.route('**/api/**', route => {
    const newUrl = route.request().url().replace(/^https?:\/\/[^/]+/, apiTarget);
    return route.continue({ url: newUrl });
  });
  await page.addInitScript(() => {
    window._capturedRequests = window._capturedRequests || [];
    const origFetch = window.fetch;
    window.fetch = function(input, init) {
      try {
        const url = typeof input === 'string' ? input : input.url;
        const hdrs = {};
        try {
          const headers = init && init.headers ? init.headers : (typeof input !== 'string' ? input.headers : undefined);
          if (headers) {
            if (headers instanceof Headers) {
              headers.forEach((v, k) => { hdrs[k] = v });
            } else if (Array.isArray(headers)) {
              for (const [k, v] of headers) hdrs[k] = v;
            } else if (typeof headers === 'object') {
              Object.assign(hdrs, headers);
            }
          }
        } catch (e) {}
        window._capturedRequests.push({ url, headers: hdrs });
      } catch (e) {}
      return origFetch.apply(this, arguments);
    };
    try {
      const origX = window.XMLHttpRequest.prototype.open;
      window.XMLHttpRequest.prototype.open = function(method, url) {
        this.__reqUrl = url;
        return origX.apply(this, arguments);
      };
      const origSend = window.XMLHttpRequest.prototype.send;
      window.XMLHttpRequest.prototype.send = function(body) {
        try {
          const url = this.__reqUrl;
          const hdrs = {};
          window._capturedRequests.push({ url, headers: hdrs });
        } catch (e) {}
        return origSend.apply(this, arguments);
      };
    } catch (e) {}
  });
  await page.goto(base);
  await page.goto(base + '/admin/products');
  await page.waitForTimeout(1500);
  const buf = await page.evaluate(() => window._capturedRequests || []);
  try { fs.mkdirSync('tests/e2e/diagnostics', { recursive: true }); } catch (e) {}
  fs.writeFileSync('tests/e2e/diagnostics/page_capture_admin_with_storage.json', JSON.stringify(buf, null, 2));
  console.log('WROTE tests/e2e/diagnostics/page_capture_admin_with_storage.json');
  await browser.close();
})();
