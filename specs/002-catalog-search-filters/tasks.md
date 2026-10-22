# Tasks: Catalog Search and Filters (As-Built)

**Input**: Design documents from `/specs/002-catalog-search-filters/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md)

**Tests**: Included; catalog tests exist in `src/App.test.tsx`.

**Organization**: Retrospective. All tasks are `[x]` because the code exists. Completion is not verification; see Evidence.

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
- [x] T008 [US1] Submit search and `year_published`, `min_players`, `max_players`, `price_min`, `price_max` on form submit in `src/App.tsx` (FE-C02-002)
- [x] T009 [US1] Render loading, error with retry, empty with clear-filters, and result states in `src/App.tsx` (FE-C02-003)

## Phase 4: User Story 2 - Order results locally (Priority: P2)

**Goal**: Browser-side ordering (FE-C02-004).

- [x] T010 [P] [US2] Cover local price sorting in `src/App.test.tsx`
- [x] T011 [US2] Implement ascending/descending price ordering and "Recomendados" (optional local `featured`) in `src/App.tsx`

## Phase N: Polish & Cross-Cutting Concerns

- [x] T012 [P] Document the as-built behavior and gaps (no category control, no range validation feedback, first page only) in [spec.md](./spec.md)
- [x] T013 [P] Add this retrospective [plan.md](./plan.md) and tasks list

## Evidence (only what the ODD/docs report)

- [`cu-c02-catalog-filtering.md`](../../../odd/tasks/cu-c02-catalog-filtering.md) reports: Frontend `npm run test:report` 2 suites / 7 tests passed; `npm run build` passed; `npm run lint` passed with one `react(set-state-in-effect)` warning.
- The same record states no browser-based visual validation and no live end-to-end validation were performed for CU-C02.
- Spec commit `6a615fdd8e72af7b3c838daca8b83b4d76d844a4` (docs only, per [`derive-project-specs.md`](../../../odd/tasks/derive-project-specs.md)).
- Frontend implementation commit for CU-C02: pending verification (not recorded in the ODD documents).
- Category filtering, pagination, invalid-range feedback, and "Recomendados" ordering: pending verification (not tested).

## Dependencies & Execution Order

Phase 1 → Phase 2 → US1 → US2 → Polish.
