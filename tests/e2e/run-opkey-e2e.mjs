import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes, randomInt, randomUUID } from 'node:crypto'
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
  'tests/e2e/sales.spec.ts',
]
let userId
let seedAttempted = false
const productId = randomInt(1500000000, 2147483648)
const orderId = randomUUID()

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
  const seed = `import json, re, sys, uuid
from decimal import Decimal
from django.contrib.auth import get_user_model
from django.db import connection, transaction

settings = connection.settings_dict
database_name = settings.get("NAME")
if not isinstance(database_name, str) or not re.fullmatch(r"sales_metrics_test_[0-9a-f]{32}", database_name) or settings.get("USER") != database_name:
  raise RuntimeError("Refusing E2E seed outside a uniquely named disposable sales metrics database")

data = json.load(sys.stdin)
product_id = int(data["product_id"])
order_id = uuid.UUID(data["order_id"])

def insert_fixture(cursor, table, values):
  cursor.execute(
    "SELECT column_name FROM information_schema.columns "
    "WHERE table_schema = current_schema() AND table_name = %s",
    [table],
  )
  available = {row[0] for row in cursor.fetchall()}
  columns = [column for column in values if column in available]
  if not columns:
    raise RuntimeError("Fixture table has no compatible columns")
  names = ", ".join(columns)
  placeholders = ", ".join(["%s"] * len(columns))
  cursor.execute(
    f"INSERT INTO {table} ({names}) VALUES ({placeholders}) ON CONFLICT DO NOTHING",
    [values[column] for column in columns],
  )

with transaction.atomic():
  user, _ = get_user_model().objects.get_or_create(
    username=data["email"],
    defaults={"email": data["email"], "is_staff": True},
  )
  if user.email != data["email"]:
    raise RuntimeError("Synthetic E2E user identity did not match")
  user.is_staff = True
  user.set_password(data["password"])
  user.save(update_fields=["is_staff", "password"])

  with connection.cursor() as cursor:
    cursor.execute("""
      CREATE TABLE IF NOT EXISTS product_boardgame (
        bgg_id integer PRIMARY KEY,
        name varchar(250) NOT NULL,
        category text NOT NULL DEFAULT ''
      )
    """)
    cursor.execute("""
      CREATE TABLE IF NOT EXISTS purchase_order (
        id uuid PRIMARY KEY,
        status varchar(32) NOT NULL,
        total numeric(12, 2) NOT NULL,
        payment_status varchar(32),
        created_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
        paid_at timestamptz
      )
    """)
    cursor.execute("""
      CREATE TABLE IF NOT EXISTS purchase_order_line (
        order_id uuid NOT NULL REFERENCES purchase_order(id) ON DELETE CASCADE,
        bgg_id integer NOT NULL REFERENCES product_boardgame(bgg_id) ON DELETE RESTRICT,
        name varchar(250) NOT NULL,
        unit_price numeric(12, 2) NOT NULL,
        quantity integer NOT NULL,
        subtotal numeric(12, 2) NOT NULL,
        PRIMARY KEY (order_id, bgg_id)
      )
    """)
    cursor.execute("SELECT CURRENT_TIMESTAMP")
    paid_at = cursor.fetchone()[0]

    product_name = "OpKey E2E Sales " + str(product_id)
    insert_fixture(cursor, "product_boardgame", {
      "bgg_id": product_id,
      "name": product_name,
      "category": "E2E Sales",
      "release_year": 2025,
      "min_players": 1,
      "max_players": 4,
      "playing_time_minutes": 60,
      "min_age": 10,
      "max_age": 12,
      "weight": Decimal("2.50"),
      "price_amount": Decimal("12.75"),
      "publisher": "E2E",
      "image_url": "/media/e2e/sales-fixture.webp",
      "image_filename": "sales-fixture.webp",
      "quantity": 0,
    })
    insert_fixture(cursor, "purchase_order", {
      "id": order_id,
      "user_id": user.pk,
      "status": "paid",
      "total": Decimal("25.50"),
      "currency": "ARS",
      "shipping_mode": "standard",
      "recipient": "E2E Sales Fixture",
      "street": "E2E Fixture Street",
      "city": "Buenos Aires",
      "postal_code": "1000",
      "phone": "0000000000",
      "mp_payment_id": "e2e-sales-" + str(order_id),
      "payment_status": "approved",
      "payment_status_detail": "approved",
      "created_at": paid_at,
      "paid_at": paid_at,
    })
    insert_fixture(cursor, "purchase_order_line", {
      "order_id": order_id,
      "bgg_id": product_id,
      "name": product_name,
      "unit_price": Decimal("12.75"),
      "quantity": 2,
      "subtotal": Decimal("25.50"),
    })

    cursor.execute(
      "SELECT name, category FROM product_boardgame WHERE bgg_id = %s",
      [product_id],
    )
    if cursor.fetchone() != (product_name, "E2E Sales"):
      raise RuntimeError("Seeded product did not match the expected fixture")
    cursor.execute(
      "SELECT status, total, created_at, paid_at FROM purchase_order WHERE id = %s",
      [order_id],
    )
    seeded_order = cursor.fetchone()
    if seeded_order is None or seeded_order[0] != "paid" or seeded_order[1] != Decimal("25.50") or seeded_order[2] != paid_at or seeded_order[3] != paid_at:
      raise RuntimeError("Seeded order did not match the expected fixture")
    cursor.execute(
      "SELECT name, unit_price, quantity, subtotal FROM purchase_order_line "
      "WHERE order_id = %s AND bgg_id = %s",
      [order_id, product_id],
    )
    if cursor.fetchone() != (product_name, Decimal("12.75"), 2, Decimal("25.50")):
      raise RuntimeError("Seeded order line did not match the expected fixture")

print(json.dumps({"user_id": user.pk}))`
  seedAttempted = true
  const seeded = JSON.parse(core(seed, JSON.stringify({
    email,
    password,
    product_id: productId,
    order_id: orderId,
  })))
  userId = String(seeded.user_id)
  if (!/^\d+$/.test(userId)) throw new Error('Invalid synthetic user ID')

  const verifySeed = `import json, sys
from decimal import Decimal
from django.db import connection
data = json.load(sys.stdin)
product_id = int(data["product_id"])
product_name = data["product_name"]
with connection.cursor() as cursor:
  cursor.execute("SELECT CURRENT_TIMESTAMP - INTERVAL '30 days', CURRENT_TIMESTAMP")
  date_from, date_to = cursor.fetchone()
  cursor.execute(
    "SELECT COALESCE(SUM(l.subtotal), 0), COUNT(DISTINCT o.id) "
    "FROM purchase_order o "
    "JOIN purchase_order_line l ON l.order_id = o.id "
    "JOIN product_boardgame p ON p.bgg_id = l.bgg_id "
    "WHERE o.status = 'paid' AND o.paid_at >= %s AND o.paid_at < %s "
    "AND p.bgg_id = %s",
    [date_from, date_to, product_id],
  )
  revenue, orders = cursor.fetchone()
  cursor.execute(
    "SELECT l.bgg_id, l.name, SUM(l.quantity), SUM(l.subtotal) "
    "FROM purchase_order o "
    "JOIN purchase_order_line l ON l.order_id = o.id "
    "JOIN product_boardgame p ON p.bgg_id = l.bgg_id "
    "WHERE o.status = 'paid' AND o.paid_at >= %s AND o.paid_at < %s "
    "AND p.bgg_id = %s "
    "GROUP BY l.bgg_id, l.name ORDER BY SUM(l.subtotal) DESC, l.bgg_id LIMIT 1",
    [date_from, date_to, product_id],
  )
  top_product = cursor.fetchone()
  cursor.execute(
    "SELECT COALESCE(o.payment_status, o.status), COUNT(DISTINCT o.id) "
    "FROM purchase_order o "
    "JOIN purchase_order_line l ON l.order_id = o.id "
    "JOIN product_boardgame p ON p.bgg_id = l.bgg_id "
    "WHERE o.created_at >= %s AND o.created_at < %s AND p.bgg_id = %s "
    "GROUP BY COALESCE(o.payment_status, o.status) "
    "ORDER BY COALESCE(o.payment_status, o.status)",
    [date_from, date_to, product_id],
  )
  payment_statuses = cursor.fetchall()
  cursor.execute(
    "SELECT CASE "
    "WHEN o.status = 'pending_payment' THEN 'Pendiente' "
    "WHEN o.paid_at > %s - INTERVAL '24 hours' THEN 'En preparación' "
    "WHEN o.paid_at > %s - INTERVAL '72 hours' THEN 'Enviado' "
    "ELSE 'Entregado' END, COUNT(DISTINCT o.id) "
    "FROM purchase_order o "
    "JOIN purchase_order_line l ON l.order_id = o.id "
    "JOIN product_boardgame p ON p.bgg_id = l.bgg_id "
    "WHERE o.created_at >= %s AND o.created_at < %s "
    "AND (o.status = 'pending_payment' OR (o.status = 'paid' AND o.paid_at IS NOT NULL)) "
    "AND p.bgg_id = %s GROUP BY 1 ORDER BY 1",
    [date_to, date_to, date_from, date_to, product_id],
  )
  dispatch_statuses = cursor.fetchall()
if (revenue != Decimal("25.50") or orders != 1
    or top_product != (product_id, product_name, 2, Decimal("25.50"))
    or payment_statuses != [("approved", 1)]
    or dispatch_statuses != [("En preparación", 1)]):
  raise RuntimeError("Independent product-filtered sales metrics verification failed")
print("Product-filtered sales metrics verified")`
  console.log(core(verifySeed, JSON.stringify({
    product_id: productId,
    product_name: `OpKey E2E Sales ${productId}`,
  })))

  const environment = {
    ...process.env,
    E2E_OPKEY_ISOLATED: 'true',
    E2E_OPKEY_DISPOSABLE: 'true',
    E2E_OPKEY_EMAIL: email,
    E2E_OPKEY_PASSWORD: password,
    E2E_SALES_PRODUCT_ID: String(productId),
    VITE_USE_OPKEY: 'true',
    VITE_API_BASE_URL: 'http://127.0.0.1:13008/api/v1',
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
  if (seedAttempted) {
    try {
      const cleanup = `import json, re, sys, uuid
from django.contrib.auth import get_user_model
from django.db import connection, transaction

settings = connection.settings_dict
database_name = settings.get("NAME")
if not isinstance(database_name, str) or not re.fullmatch(r"sales_metrics_test_[0-9a-f]{32}", database_name) or settings.get("USER") != database_name:
  raise RuntimeError("Refusing E2E cleanup outside a uniquely named disposable sales metrics database")

data = json.load(sys.stdin)
with transaction.atomic():
  with connection.cursor() as cursor:
    order_id = uuid.UUID(data["order_id"])
    product_id = int(data["product_id"])
    cursor.execute("DELETE FROM purchase_order_line WHERE order_id = %s AND bgg_id = %s", [order_id, product_id])
    cursor.execute("DELETE FROM purchase_order WHERE id = %s", [order_id])
    cursor.execute(
      "DELETE FROM product_boardgame WHERE bgg_id = %s AND name = %s",
      [product_id, data["product_name"]],
    )
    cursor.execute(
      "SELECT (SELECT COUNT(*) FROM purchase_order_line WHERE order_id = %s), "
      "(SELECT COUNT(*) FROM purchase_order WHERE id = %s), "
      "(SELECT COUNT(*) FROM product_boardgame WHERE bgg_id = %s AND name = %s)",
      [order_id, order_id, product_id, data["product_name"]],
    )
    if cursor.fetchone() != (0, 0, 0):
      raise RuntimeError("Sales fixture rows remained after cleanup")
  user = get_user_model().objects.filter(username=data["email"], email=data["email"])
  user.delete()
  if get_user_model().objects.filter(username=data["email"], email=data["email"]).exists():
    raise RuntimeError("Synthetic E2E user remained after cleanup")
print("Sales fixture and synthetic user removed")`
      console.log(core(cleanup, JSON.stringify({
        email,
        order_id: orderId,
        product_id: productId,
        product_name: `OpKey E2E Sales ${productId}`,
      })))
    } catch {
      console.error('Sales fixture or synthetic user cleanup failed')
      process.exitCode = 1
    }
  }
  rmSync(output, { recursive: true, force: true })
}