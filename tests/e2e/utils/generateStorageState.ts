import * as fs from 'fs/promises'

type StorageEntry = { name: string; value: string }

export async function generateStorageState(outPath = 'tests/e2e/storageState.json', baseURL = 'http://localhost:3000') {
  try {
    // Accept undefined baseURL from Playwright fixtures; fallback to localhost
    baseURL = baseURL || 'http://localhost:3000'
    // if file exists and valid, skip
    const raw = await fs.readFile(outPath, 'utf8').catch(() => '')
    if (raw) {
      try {
        const parsed = JSON.parse(raw)
        if (parsed && parsed.origins) return
      } catch {
        // fall through
      }
    }

    const email = process.env.TEST_ADMIN_EMAIL || 'admin@example.com'
    const password = process.env.TEST_ADMIN_PASSWORD || 'password'
    const loginUrl = `${(process.env.PW_API_TARGET || 'http://localhost:5000')}/api/v1/auth/login`

    let resp: any = null
    let json: any = null
    const maxRetries = 3
    for (let i = 0; i < maxRetries; i++) {
      resp = await fetch(loginUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      }).catch((e) => { resp = { ok: false, status: 0 }; return resp })
      try {
        // resp may be a plain object fallback; guard access
        if (resp && typeof resp.json === 'function') json = await resp.json()
        else json = { ok: false, status: resp && resp.status }
      } catch (e) {
        json = { parseError: String(e) }
      }
      await fs.writeFile('tests/e2e/login-response.json', JSON.stringify({ attempt: i+1, status: resp.status, body: json }, null, 2)).catch(()=>{})
      if (resp && resp.ok) break
      await new Promise(r => setTimeout(r, 300))
    }
    if (!resp || !resp.ok) throw new Error(`login failed ${resp && resp.status}`)
    // Support multiple upstream shapes: plain tokens, nested .session, or tokens object
    const access = json.access_token || json.access?.token || json.tokens?.access_token || json.session?.access_token || json.session?.tokens?.token
    const refresh = json.refresh_token || json.refresh?.token || json.tokens?.refresh_token || json.session?.refresh_token || json.session?.tokens?.refreshToken

    if (!access) {
      await fs.writeFile('tests/e2e/login-response.json', JSON.stringify({ status: resp.status, body: json }, null, 2)).catch(()=>{})
      throw new Error('no access token in login response')
    }

    const sessionValue = JSON.stringify({ access_token: access, refresh_token: refresh ?? null, csrf_token: null })
    const storage = {
      cookies: [],
      origins: [
        {
          origin: baseURL,
          localStorage: [],
          sessionStorage: [
            { name: 'bgg-shop.session', value: sessionValue },
          ] as StorageEntry[],
        },
      ],
    }

    // Ensure parent directory exists (Playwright may run with different cwd)
    const outDir = outPath.replace(/\/[^\/]*$/,'') || 'tests/e2e'
    await fs.mkdir(outDir, { recursive: true }).catch(()=>{})
    await fs.writeFile(outPath, JSON.stringify(storage, null, 2), 'utf8')

    // Also write an init script that reliably sets sessionStorage when loaded via Playwright
    const initScriptPath = 'tests/e2e/initSession.js'
    const initScript = `(() => { try { window.sessionStorage.setItem('bgg-shop.session', ${JSON.stringify(sessionValue)}); } catch(e) { /* ignore */ } })();`;
    await fs.writeFile(initScriptPath, initScript, 'utf8')
    console.log('Generated storageState at', outPath, 'and init script at', initScriptPath)
  } catch (e) {
    console.error('generateStorageState failed:', e)
    throw e
  }
}

export default generateStorageState
