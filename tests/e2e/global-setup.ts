import * as fs from 'fs';
import * as path from 'path';
import { chromium } from 'playwright';

export default async function globalSetup() {
  const bff = process.env.PW_BFF_URL ?? 'http://localhost:5000';
  const email = process.env.E2E_ADMIN_EMAIL ?? 'e2e_admin@example.com';
  const password = process.env.E2E_ADMIN_PASSWORD ?? 'e2e_password';

  const loginUrl = `${bff}/api/v1/auth/login`;

  // Use Playwright to perform the login and capture cookies + storageState
  const browser = await chromium.launch();
  const context = await browser.newContext();
  try {
    // Use the context's request to POST login so the upstream can return Set-Cookie
    const apiRes = await context.request.post(loginUrl, {
      data: { email, password },
      headers: { 'Content-Type': 'application/json' },
    });
    if (!apiRes.ok()) {
      const text = await apiRes.text();
      throw new Error(`Login failed: ${apiRes.status()} ${text}`);
    }
    const payload = await apiRes.json();
    const session = payload.session;
    if (!session || !session.access_token) {
      throw new Error(`Login did not return a session: ${JSON.stringify(payload)}`);
    }

    // Parse Set-Cookie headers from the API response and add to the browser context
    const headers = apiRes.headers();
    const setCookieRaw = headers['set-cookie'];
    const cookieList: any[] = [];
    const loginHost = new URL(loginUrl).hostname;
    if (setCookieRaw) {
      // setCookieRaw may be a single string with multiple cookies separated by comma; try splitting safely
      const rawCookies = Array.isArray(setCookieRaw) ? setCookieRaw : [setCookieRaw];
      for (const ch of rawCookies) {
        const parts = ch.split(';').map(p => p.trim());
        const [nameValue, ...attrs] = parts;
        const [name, ...valParts] = nameValue.split('=');
        const value = valParts.join('=');
        const cookie: any = {
          name: name,
          value: value,
          domain: loginHost,
          path: '/',
          httpOnly: false,
          secure: false,
          sameSite: 'Lax',
        };
        for (const a of attrs) {
          const [k, v] = a.split('=');
          const key = k.toLowerCase();
          if (key === 'httponly') cookie.httpOnly = true;
          else if (key === 'secure') cookie.secure = true;
          else if (key === 'max-age' && v) {
            const max = Number(v);
            if (!Number.isNaN(max)) cookie.expires = Math.floor(Date.now() / 1000) + max;
          } else if (key === 'expires' && v) {
            const t = Date.parse(v);
            if (!Number.isNaN(t)) cookie.expires = Math.floor(t / 1000);
          } else if (key === 'domain' && v) {
            cookie.domain = v;
          } else if (key === 'path' && v) {
            cookie.path = v;
          }
        }
        cookieList.push(cookie);
      }
    }

    if (cookieList.length) {
      // Playwright expects 'url' field when adding cookies with domainless entries; ensure domain is set
      const cookiesToAdd = cookieList.map((c: any) => ({ ...c }));
      await context.addCookies(cookiesToAdd.map((c: any) => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, expires: c.expires, httpOnly: c.httpOnly, secure: c.secure, sameSite: c.sameSite })));
    }

    // Create a page and set sessionStorage so the app sees the session
    const page = await context.newPage();
    const sessionValue = JSON.stringify(session);
    await page.goto('http://localhost:3000/');
    await page.evaluate(({ key, value }) => {
      try { window.sessionStorage.setItem(key, value); } catch (e) { /* ignore */ }
    }, { key: 'bgg-shop.session', value: sessionValue });

    // Persist storageState (cookies + origins) manually so Playwright will load cookies + sessionStorage
    const outPath = path.join(process.cwd(), 'tests/e2e/storageState.json');
    const storage = {
      cookies: cookieList.map(c => ({ name: c.name, value: c.value, domain: c.domain, path: c.path, httpOnly: c.httpOnly || false, secure: c.secure || false, sameSite: c.sameSite || 'Lax', expires: c.expires })),
      origins: [
        {
          origin: 'http://localhost:3000',
          localStorage: [],
          sessionStorage: [
            { name: 'bgg-shop.session', value: sessionValue },
          ],
        },
      ],
    };
    fs.writeFileSync(outPath, JSON.stringify(storage, null, 2));

    // Also write an init script to reliably populate sessionStorage in Playwright contexts
    const initPath = path.join(process.cwd(), 'tests/e2e/initSession.js');
    const initScript = `(() => { try { window.sessionStorage.setItem('bgg-shop.session', ${JSON.stringify(sessionValue)}); } catch(e) { /* ignore */ } })();`;
    fs.writeFileSync(initPath, initScript);

    // Additionally write a small fetch monkeypatch to ensure Authorization header is injected
    // from sessionStorage for environments where CORS preflight may remove headers.
    const fetchInitPath = path.join(process.cwd(), 'tests/e2e/initFetchAuth.js');
    const fetchInit = `(() => {
  try {
    const origFetch = window.fetch;
    window.fetch = async function(input, init) {
      try {
        const raw = window.sessionStorage.getItem('bgg-shop.session') || '{}';
        const s = JSON.parse(raw);
        const token = s && s.access_token;
        const opKey = s && (s.op_key || s.opKey || s.opKey);
        const finalInit = init ? Object.assign({}, init) : {};
        finalInit.headers = new Headers(finalInit.headers || {});
        if (token && !finalInit.headers.has('Authorization')) {
          finalInit.headers.set('Authorization', 'Bearer ' + token);
        }
        if (opKey && !finalInit.headers.has('X-Op-Key')) {
          finalInit.headers.set('X-Op-Key', opKey);
        }
        return origFetch.call(this, input, finalInit);
      } catch (e) {
        return origFetch.call(this, input, init);
      }
    };
  } catch (e) { /* ignore */ }
})();`;
    fs.writeFileSync(fetchInitPath, fetchInit);
    console.log('Wrote Playwright storage state to', outPath, 'and init scripts to', initPath, fetchInitPath);

    await page.close();
  } finally {
    await browser.close();
  }
}
