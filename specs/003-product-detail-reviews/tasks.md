# Tasks: Product Detail and Reviews (As-Built)

**Input**: Design documents from `/specs/003-product-detail-reviews/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md)
**Status**: Closed with scope limitations on 2026-10-30; see the [canonical closure](../../../specs/003-product-detail-reviews-as-built/spec.md).

**Tests**: Dedicated component and read-only browser tests are linked below.

**Organization**: Retrospective. All tasks are `[x]` because the code exists. Completion is not verification; see Evidence.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Configure the Vite/React/TypeScript project in `package.json`, `vite.config.ts`, `tsconfig.app.json`
- [x] T002 [P] Regenerate types with `npm run generate:types` into `src/types/generated/bff-api.d.ts` (OpenAPI types regenerated, per the ODD record)

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T003 Add `slugify` and product-name-to-slug navigation in `src/App.tsx`
- [x] T004 [P] Add Spanish review error and status copy in `src/ui/messages.ts`
- [x] T005 Add the `/juegos/{slug}` route in `App` in `src/App.tsx`

## Phase 3: User Story 1 - View detail and approved reviews (Priority: P1) 🎯 MVP

**Goal**: Open a product by slug and see detail with approved reviews (FE-C03-001, FE-C03-002).

**Independent Test**: Run the component and read-only browser tests listed below against the configured local environment.

- [x] T006 [US1] Implement `ProductDetailScreen` request to `GET /api/v1/games/{slug}` with loading, detail, error, and return-to-catalog in `src/App.tsx` (FE-C03-001)
- [x] T007 [US1] Render image, name, publisher, year, players, duration, age, stock, price, review summary, and approved reviews (or empty message) in `src/App.tsx` (FE-C03-002)

## Phase 4: User Story 2 - Submit a review (Priority: P2)

**Goal**: Authenticated buyers submit a review that stays pending (FE-C03-003).

- [x] T008 [US2] Implement the review form (rating 1–5, required body up to 2000 characters, trimmed) in `src/App.tsx`
- [x] T009 [US2] Post `{ rating, body }` to `POST /api/v1/games/{slug}/reviews` with the bearer token, show sign-in prompt when no session, and show pending-moderation confirmation in `src/App.tsx`
- [x] T010 [US2] Map review error codes to buyer-facing text in `src/ui/messages.ts`

## Phase N: Polish & Cross-Cutting Concerns

- [x] T011 [P] Document the as-built behavior and gaps (no login link in the sign-in prompt, weight/category not shown, no distinct not-found screen) in [spec.md](./spec.md)
- [x] T012 [P] Add this retrospective [plan.md](./plan.md) and tasks list
- [x] T013 Cover detail presentation, anonymous/authenticated review behavior, and duplicate feedback with a mocked BFF in [review component tests](../../src/App.reviews.test.tsx), aligned with [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml) and [catalog UI](../../src/App.tsx).
- [x] T014 Verify live detail, unknown product, and anonymous review rejection without database writes in [browser tests](../../tests/e2e/product-reviews.spec.ts), against the [BFF detail controller](../../../bgg-shop-bff/src/controllers/product_detail_controller.py), [review controller](../../../bgg-shop-bff/src/controllers/reviews_controller.py), and [Core resolvers](../../../bgg-shop-core/saleor/graphql/api.py).
- [x] T015 Verify authenticated submission, duplicate rejection, and pending-review visibility using the opt-in [browser test](../../tests/e2e/product-reviews.spec.ts), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [BFF review controller](../../../bgg-shop-bff/src/controllers/reviews_controller.py), [Core resolver](../../../bgg-shop-core/saleor/graphql/api.py), and disposable PostgreSQL.

## Evidence (only what the ODD/docs report)

- [`cu-c03-product-reviews.md`](../../../odd/tasks/cu-c03-product-reviews.md) reports: Frontend Vitest suite 15 tests passed, OpenAPI types regenerated, lint with one warning in the catalog loading effect, production build passed.
- [`CU-C01-C03-E2E-VALIDATION.md`](../../../docs/CU-C01-C03-E2E-VALIDATION.md) reports a headless-browser run on the live stack that submitted a review on `/juegos/watergate` and created a `PENDING` row; it notes frontend types were not regenerated for the new review `502`.
- The ODD record lists the Frontend detail/review commit as "Pending"; commit identity: pending verification.
- On 2026-10-30, `npm run test -- --run src/App.reviews.test.tsx` passed (5 tests), the full Vitest suite passed (146 tests), and `npm run build` passed. `E2E_OPKEY_ISOLATED=true npx playwright test tests/e2e/product-reviews.spec.ts --project=chromium --reporter=line --output=/tmp/bgg-product-reviews-e2e` passed (2 read-only tests, one isolated test skipped) against local services.
- On 2026-10-30, with a separately provisioned disposable database and BFF/Core, `E2E_OPKEY_ISOLATED=true C03_DISPOSABLE_REVIEW_E2E=true npx playwright test tests/e2e/product-reviews.spec.ts --project=chromium --grep 'authenticated review through an isolated' --reporter=line --output=/tmp/bgg-product-reviews-isolated-e2e` passed (1 test). It created only synthetic data in the disposable stack, verified pending status and duplicate rejection, and the stack was removed afterward. The test is skipped unless explicitly enabled and requires the isolated marker product and BFF on port 5001.
- Spec commit `6a615fdd8e72af7b3c838daca8b83b4d76d844a4` (docs only, per [`derive-project-specs.md`](../../../odd/tasks/derive-project-specs.md)).

## Dependencies & Execution Order

Phase 1 → Phase 2 → US1 → US2 → Polish.
