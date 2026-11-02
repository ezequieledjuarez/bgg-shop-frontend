# Tasks: Catalog Search and Filters (As-Built)

**Input**: Design documents from `/specs/002-catalog-search-filters/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md)
**Status**: Closed with exceptions on 2026-10-30; T018 and T019 remain open follow-ups. See the [canonical closure](../../../specs/002-catalog-search-filters-as-built/spec.md).

**Tests**: Included; catalog tests exist in `src/App.test.tsx`.

**Organization**: Retrospective completed tasks and an explicitly deferred follow-up. Completion is not verification; see Evidence.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Configure the Vite/React/TypeScript project in `package.json`, `vite.config.ts`, `tsconfig.app.json`
- [x] T002 [P] Configure test setup in `src/test/setup.ts`
- [x] T003 [P] Regenerate types with `npm run generate:types` into `src/types/generated/bff-api.d.ts`

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T004 Add MSW catalog handler typed from generated types in `src/mocks/handlers.ts`
- [x] T005 [P] Add Spanish catalog copy in `src/ui/messages.ts`

## Phase 3: User Story 1 - Browse and filter the catalog (Priority: P1) 🎯 MVP

**Goal**: Load, search, and filter the public catalog through the BFF (FE-C02-001..FE-C02-003).

**Independent Test**: Run `src/App.test.tsx`.

- [x] T006 [P] [US1] Cover initial load, submitted search and numeric filters, empty-state recovery, and request failure in `src/App.test.tsx`
- [x] T007 [US1] Load `GET /api/v1/products` (`page=1&page_size=100`) and render `ProductCard` data in `src/App.tsx` (FE-C02-001)
- [x] T008 [US1] Submit search on form submission and apply `year_published`, `min_players`, `max_players`, `price_min`, `price_max` on changes in `src/App.tsx` (FE-C02-002)
- [x] T009 [US1] Render loading, error with retry, empty with clear-filters, and result states in `src/App.tsx` (FE-C02-003)

## Phase 4: User Story 2 - Order results locally (Priority: P2)

**Goal**: Browser-side ordering (FE-C02-004).

- [x] T010 [P] [US2] Cover local price sorting in `src/App.test.tsx`
- [x] T011 [US2] Implement ascending/descending price ordering in `src/App.tsx`. The previous provisional "Recomendados" option was removed and deferred in T018.

## Phase N: Polish & Cross-Cutting Concerns

- [x] T012 [P] Document the as-built behavior and gaps in [spec.md](./spec.md)
- [x] T013 [P] Add this retrospective [plan.md](./plan.md) and tasks list
- [x] T014 Add the category selector, request parameter, and reset in [Catalog UI](../../src/App.tsx); cover the interaction with a mocked BFF in [catalog tests](../../src/App.test.tsx), aligned with [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml) and the [Core resolver](../../../bgg-shop-core/saleor/graphql/api.py).
- [x] T015 Load category names dynamically, submit the selected name, and provide retry on failure in [Catalog UI](../../src/App.tsx); cover dynamic options, filtering, reset, and retry in [catalog tests](../../src/App.test.tsx), against [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml) and the [Core SDL](../../../bgg-shop-core/specs/schema.graphql).
- [x] T016 Add pagination, first-page reset on filter changes, and descriptive invalid-range feedback in [Catalog UI](../../src/App.tsx), covered by [component tests](../../src/App.test.tsx) and [E2E tests](../../tests/e2e/catalog-filters.spec.ts); pagination uses the existing [BFF OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml) contract.
- [x] T017 Add read-only local E2E coverage for representative filter combinations, empty/reset behavior, pagination, and range recovery in [catalog E2E tests](../../tests/e2e/catalog-filters.spec.ts).
- [ ] T018 Deferred: define recommendation criteria and implement and verify "Recomendados" when requested. The option is not currently displayed.
- [ ] T019 Deferred: correct horizontal overflow at a 320 px viewport in the header and hero, then add a browser regression check for the full page. The overflow was observed locally; the pagination controls fit. Relevant implementation: [catalog UI](../../src/App.tsx) and [styles](../../src/App.css); extend [catalog E2E tests](../../tests/e2e/catalog-filters.spec.ts) when correcting it.

## Evidence (only what the ODD/docs report)

- [`cu-c02-catalog-filtering.md`](../../../odd/tasks/cu-c02-catalog-filtering.md) reports: Frontend `npm run test:report` 2 suites / 7 tests passed; `npm run build` passed; `npm run lint` passed with one `react(set-state-in-effect)` warning.
- The same record states no browser-based visual validation and no live end-to-end validation were performed for CU-C02.
- Spec commit `6a615fdd8e72af7b3c838daca8b83b4d76d844a4` (docs only, per [`derive-project-specs.md`](../../../odd/tasks/derive-project-specs.md)).
- Frontend implementation commit for CU-C02: pending verification (not recorded in the ODD documents).
- On 2026-10-30, `npm run test -- --run src/App.test.tsx -t 'filters by category alongside other criteria and clears it'` passed (1 test; 7 skipped). This uses a mocked BFF and does not validate live filtering.
- On 2026-10-30, `npm run test -- --run src/App.test.tsx` passed (8 tests) and `npm run build` passed.
- On 2026-10-30, `npm run test -- --run src/App.test.tsx` passed (9 tests), `npm run build` passed, and `npx oxlint --quiet` reported 0 errors and 56 warnings. Playwright against the active local frontend/BFF/Core displayed the response for all four categories: 9 family, 1 party, 9 thematic, and 65 strategy products; all had the requested category. Other filter combinations, pagination, invalid-range feedback, and "Recomendados" ordering were not verified by that browser check.
- On 2026-10-30, `npm run test -- --run src/App.test.tsx` passed (11 tests), `npm run build` passed, and `E2E_OPKEY_ISOLATED=true npx playwright test tests/e2e/catalog-filters.spec.ts --project=chromium --reporter=line --output=/tmp/bgg-catalog-filters-e2e` passed (4 tests). The E2E run used anonymous read-only requests to local frontend, BFF, and Core; it requires local catalog data with at least two pages and tests representative, not exhaustive, filter combinations.
- On 2026-10-30, `npm run test -- --run --reporter=dot` passed (13 files, 141 tests), with MSW warnings for the unhandled categories request in other suites. A local browser check found the pagination controls within 320, 390, and 1280 px viewports; at 320 px the page still overflows horizontally in the header and hero.

## Dependencies & Execution Order

Phase 1 → Phase 2 → US1 → US2 → Polish.
