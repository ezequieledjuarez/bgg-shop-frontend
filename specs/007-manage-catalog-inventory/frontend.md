# CU-A01 — Frontend Responsibilities (React)

Reference: ../../../specs/006-manage-catalog-inventory/spec.md

## Purpose
Construir la interfaz administrativa para que los Administradores gestionen catálogo, inventario y promociones, y asegurar que la experiencia muestre estados claros, validaciones y feedback de errores.

## Responsibilities
- Implementar pantallas/admin flows:
  - Lista de productos (filtros, búsqueda, paginación)
  - Formulario de crear/editar producto (campos obligatorios y una imagen `.webp` por URL o nombre de archivo, sin asumir subida de binarios); cada edición o variante es un producto independiente
  - Ajustes de stock por producto: `IN` aumenta y `OUT` reduce, incluso parcialmente
  - Panel de promociones y cupones (crear y editar); cada producto puede tener su propia promoción, sin combinar descuentos sobre un mismo producto, y prevalece el que descuente más pesos
  - Vista de auditoría (historial de cambios)
- Validaciones en cliente (complementarias al servidor) y mostrar mensajes de error por campo.
- Mostrar estado de operaciones asíncronas (saving, success, error) y prevenir duplicados de envío.
- Soportar preview de promoción en la ficha antes de publicar.
- Coupon preview uses `POST /api/v1/cart/coupons/preview`, is authenticated,
  reads the current user's cart and does not reserve or consume a use. Checkout
  separately receives the selected coupon.

## Data/Contract Expectations
- These are requirements, not proof of frontend implementation: when `OUT` exceeds available stock, inform the user that stock will reach zero. A communication or HTTP error does not prove rollback: the server may commit and the response may be lost. Each movement has a UUID and identity defined by product, direction and quantity. Retrying with the same UUID and data returns the original result or resumes unfinished work without duplication, even after a long delay; a concurrent execution may return `IN_PROGRESS`. A UUID reused with different data is rejected. The stock change, audit and final result commit atomically, and successful UUIDs do not expire. No movement is resumed automatically without a retry. Failed, rejected or no-change operations may retry the same exact payload; successful movement identity is retained permanently. Checkout reserves coupon use atomically; only confirmed failure/cancellation releases it, and uncertain outcomes remain reserved through reconciliation.
- Weekly audit ZIP generation and the mechanism enforcing deletion permission are pending and outside the current 007 scope; the future solution is not implemented or validated. Manual deletion is the user's responsibility and is agreed only for `is_superuser=true`; `is_staff` alone is insufficient. Filesystem enforcement is not established. Weekly execution may delay archiving and removal, so compatibility with removal exactly at seven days remains open.
- Use admin endpoints at BFF (e.g., `/admin/products`, `/admin/promotions`).
- Expect field-level error payloads: { field: 'price', message: 'required' } and map to form fields.
- Stock adjustments use `POST /api/v1/admin/products/{product_id}/stock` with `movement_id`, `direction` and `quantity`; the BFF contract also exposes UUID generation and status lookup. `IN` increases stock and `OUT` reduces it, including partially; at zero the product remains visible and displays exactly «Sin stock». Reservations and unpublishing do not exist; physical deletion is not implied. When `OUT` exceeds available stock, inform the user that stock will reach zero.
- Stock trace: requirement `specs/006-manage-catalog-inventory/spec.md`; current contracts `bgg-shop-core/specs/schema.graphql` and `bgg-shop-bff/specs/openapi.yaml`; related frontend code `bgg-shop-frontend/src/admin/products/ProductsList.tsx` and BFF implementation `bgg-shop-bff/src/controllers/admin_products_controller.py`; related tests `bgg-shop-frontend/tests/e2e/variants-stock.spec.ts` and `bgg-shop-bff/tests/test_admin_validation.py`. The final isolated browser run passed the stock adjustment flow; exact command and outcome are in `odd/tasks/007-closeout.md`.
- Basic audit is in scope for product changes, stock movements, promotions, and coupons, recording user, date, action, and previous and new values. Audit filters, pagination and redaction are implemented and covered by focused tests and the final local audit browser flow (`bgg-shop-frontend/tests/e2e/audit.spec.ts`; output included `Audit verified`). Weekly audit ZIP generation and related retention enforcement are explicitly outside Spec 007 and remain unresolved: the future proposal specifies seven days in the database and a weekly local ZIP, with no deletion before successful archival and no automatic purge; whether a weekly run can meet removal exactly at seven days, the start/time of retention, failure atomicity, archive access/querying and encryption still require separate decisions. ZIP files have no automatic expiration and are retained until manually deleted; the previous one-month archive decision is superseded.
- Approved promotion rules: omitted/null `product_bgg_id` means global; an eligible product-specific offer wins even over a higher global percentage, otherwise the highest eligible global offer applies. Store promotions do not stack and coupon-linked rows are excluded. Coupon/store comparison and rounding follow `specs/007-manage-catalog-inventory/plan.md` and the API/Core contracts. Checkout implementation is covered by `bgg-shop-core/saleor/graphql/orders.py`, `bgg-shop-core/tests/test_coupon_calculations.py` and the selected PostgreSQL tests `test_checkout_store_promotions_select_specific_and_highest_global_but_exclude_coupon_rows` and `test_checkout_total_uses_specific_and_highest_global_store_promotions` in `bgg-shop-core/tests/test_graphql_credit_postgres.py`; both selected tests passed. The entire PostgreSQL file was not run. The final browser suite covered coupon create/list/edit, product-specific promotion preview/create/list and global promotion create/list. Final local evidence and limitations are in `odd/tasks/007-closeout.md`.
- The authenticated current-cart coupon preview follows the BFF contract and is covered by `bgg-shop-frontend/src/App.cart.test.tsx` (9 tests passed). The final browser suite specifically covered the admin coupon and promotion flows; no claim is made that coupon preview was exercised in that browser suite.

## Accessibility & UX
- Forms accessible with labels, ARIA where necessary, and keyboard navigation.
- Confirmation requirements for destructive operations do not imply unpublishing or physical deletion.

## Acceptance Criteria (Frontend)
- AC-FE-1: Admin can create and edit products using the UI; after save, the UI shows the new data as returned by the BFF.
- AC-FE-2: `IN` increases stock and `OUT` reduces it, including partially; at zero the product remains visible with exactly «Sin stock». No reservations are made; when `OUT` exceeds available stock, inform the user that stock will reach zero.
- AC-FE-3: Promotions can be created/edited and the effective price previewed; eligible product-specific store offers beat global offers, otherwise the highest eligible global offer applies. Store promotions do not stack and coupon-linked rows are excluded. Coupon/store comparison and rounding follow the overall plan/contracts.
- AC-FE-4: Field-level errors from BFF are rendered inline and prevent form submission until resolved.

## Tests (Frontend)
- Unit tests for form components and validation logic.
- Local integration/browser evidence covers product create/readback/edit, stock, audit, coupons and product-specific/global promotion flows; references and exact final command are in `odd/tasks/007-closeout.md`.

## Status
F-1 through F-5 are complete with focused local checks and the final isolated
browser run. No CI, deployment or remote validation is claimed. Weekly audit
ZIP generation and retention remain outside Spec 007 and require separate
decisions.

## Approved contract dependencies (2026-11-02)

The API contract requires a positive product price; create requires name, price
and quantity, while updates are partial and cannot modify BGG ID or quantity.
Exactly one `.webp` image reference is supplied as a URL or path/filename;
binary upload is not part of this contract. A product can have at most one
active promotion, and the promotion's product link is represented by BGG ID.
Admin access requires an active `is_staff` or `is_superuser` user.

Stock remains nonnegative. An overstock `OUT` applies only available units and
reports requested and applied quantities. Successful movement UUIDs persist
indefinitely; failed, rejected or no-change operations may retry the same exact
payload indefinitely, while reusing an ID with a different product, direction
or quantity rejects.

Coupon preview is authenticated and read-only against the current user's cart;
it never reserves or consumes a use. A chosen code is sent to checkout, where a
use is reserved atomically. Only confirmed failure/cancellation releases it;
uncertain provider outcomes remain reserved through reconciliation and move to
manual review if unresolved. A timeout alone never releases it. Codes are
exact, case-sensitive matches without normalization; remaining uses are
nonnegative and UTC validity is `[starts_at, ends_at)` with start before end
when both exist. Discounts above 50% of undiscounted cart subtotal are
rejected, not capped. Intermediate amounts are truncated to two decimals, then
rounded to whole pesos: fractions through 0.50 round down and 0.51 or more
round up. These are API/business contracts, not evidence by themselves.
Focused UI tests and the final local browser run provide evidence for the
covered admin flows; BFF/Core focused checks cover the coupon/checkout
contracts. Event/cache and audit read behavior have local verification
evidence recorded in the task ledger.
