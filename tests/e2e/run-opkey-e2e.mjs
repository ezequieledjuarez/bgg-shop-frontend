import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes, randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const email = `opkey-e2e-${randomUUID()}@example.test`
const password = randomBytes(24).toString('hex')
const coreContainer = process.env.E2E_CORE_CONTAINER
const specs = [
  'tests/e2e/admin.spec.ts',
  'tests/e2e/product-create.spec.ts',
  'tests/e2e/product-edit.spec.ts',
  'tests/e2e/variants-stock.spec.ts',
  'tests/e2e/promotions.spec.ts',
  'tests/e2e/coupons.spec.ts',
  'tests/e2e/audit.spec.ts',
]
let userId

if (coreContainer !== 'bgg-e2e-007-closeout-api') {
  throw new Error('E2E_CORE_CONTAINER must name the verified disposable Spec 007 Core container')
}

const output = mkdtempSync(join(tmpdir(), 'opkey-e2e-'))

function core(script, input) {
  return execFileSync('podman', ['exec', '-i', coreContainer, 'python', 'manage.py', 'shell', '-c', script], {
    input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'],
  }).trim()
}

try {
  const create = `import json, sys
from django.contrib.auth import get_user_model
data = json.load(sys.stdin)
user = get_user_model().objects.create_user(username=data["email"], email=data["email"], password=data["password"], is_staff=True)
print(user.pk)`
  userId = core(create, JSON.stringify({ email, password }))
  if (!/^\d+$/.test(userId)) throw new Error('Invalid synthetic user ID')

  const environment = {
    ...process.env,
    E2E_OPKEY_ISOLATED: 'true',
    E2E_OPKEY_DISPOSABLE: 'true',
    E2E_OPKEY_EMAIL: email,
    E2E_OPKEY_PASSWORD: password,
    VITE_USE_OPKEY: 'true',
    VITE_API_BASE_URL: 'http://localhost:13008/api/v1',
  }
  const result = spawnSync(process.execPath, [
    'node_modules/@playwright/test/cli.js', 'test', ...specs,
    '--project', 'chromium', '--reporter=line', '--workers', '1', '--output', output,
  ], { env: environment, stdio: 'inherit' })
  if (result.status !== 0) {
    process.exitCode = result.status || 1
  } else {
    const audit = `import sys
from opkeys.models import OpKeyAudit, OpSession
user_id = int(sys.stdin.read())
session = OpSession.objects.filter(user_id=user_id, revoked=True).first()
assert session
assert OpKeyAudit.objects.filter(session_id=session.pk, action="ISSUE", actor_user_id=user_id, actor_source="AUTHENTICATED_USER").exists()
assert OpKeyAudit.objects.filter(session_id=session.pk, action="LOGOUT", actor_user_id=user_id, actor_source="KEY_HOLDER").exists()
print("Audit verified")`
    console.log(core(audit, userId))
  }
} catch (error) {
  console.error('OpKey E2E setup or audit failed:', error.message.split('\n')[0])
  process.exitCode = 1
} finally {
  if (userId && /^\d+$/.test(userId)) {
    try {
      const cleanup = `import json, sys
from django.contrib.auth import get_user_model
data = json.load(sys.stdin)
get_user_model().objects.get(pk=data["id"], username=data["email"]).delete()
print("Synthetic user removed")`
      console.log(core(cleanup, JSON.stringify({ id: userId, email })))
    } catch {
      console.error(`Synthetic user cleanup failed; id=${userId}`)
      process.exitCode = 1
    }
  }
  rmSync(output, { recursive: true, force: true })
}