#!/usr/bin/env node
const fs = require('fs').promises
const fetch = global.fetch || require('node-fetch')

async function main() {
  const email = process.env.E2E_ADMIN_EMAIL || 'admin@example.com'
  const password = process.env.E2E_ADMIN_PASSWORD || 'password'
  const apiBase = process.env.E2E_API_BASE || 'http://localhost:5000/api/v1'
  const out = 'tests/e2e/storageState.json'

  console.log('Logging in', email, '->', apiBase + '/auth/login')
  const res = await fetch(`${apiBase}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  if (!res.ok) {
    console.error('Login failed', res.status)
    const t = await res.text().catch(() => '')
    console.error(t)
    process.exit(2)
  }
  const payload = await res.json()
  const session = payload.session || (payload.data && payload.data.session)
  if (!session) {
    console.error('Login response did not include session object')
    console.error(JSON.stringify(payload, null, 2))
    process.exit(3)
  }

  const state = {
    cookies: [],
    origins: [
      {
        origin: 'http://localhost:3000',
        localStorage: [],
        sessionStorage: [
          {
            name: 'bgg-shop.session',
            value: JSON.stringify(session),
          },
        ],
      },
    ],
  }

  await fs.mkdir('tests/e2e', { recursive: true })
  await fs.writeFile(out, JSON.stringify(state, null, 2), 'utf8')
  console.log('Wrote', out)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
