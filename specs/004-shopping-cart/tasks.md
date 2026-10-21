# Tasks: Shopping Cart (As-Built)

**Input**: Design documents from `/specs/004-shopping-cart/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md)

**Tests**: Included; cart tests exist in `src/App.cart.test.tsx`.

**Organization**: Retrospective. All tasks are `[x]` because the code exists. Completion is not verification; see Evidence.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Configure the Vite/React/TypeScript project in `package.json`, `vite.config.ts`, `tsconfig.app.json`
- [x] T002 [P] Regenerate cart and inventory types with `npm run generate:types` into `src/types/generated/bff-api.d.ts`

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T003 Add `cartRequestOptions` (credentials, optional bearer) in `src/App.tsx`
- [x] T004 [P] Add MSW cart handlers (`GET`, `POST`, `PATCH`, `DELETE`) in `src/mocks/handlers.ts`
- [x] T005 [P] Add Spanish cart copy in `src/ui/messages.ts`

## Phase 3: User Story 1 - Add and view the cart (Priority: P1) 🎯 MVP

**Goal**: Add an available product and see the cart (FE-C04-001, FE-C04-002).

**Independent Test**: Run `src/App.cart.test.tsx`.

- [x] T006 [P] [US1] Cover stock display, adding a line, empty state, load error, zero-stock disabling, and BFF stock warning in `src/App.cart.test.tsx`
- [x] T007 [US1] Show stock on `ProductCard`, disable add at zero stock, post `CartItemRequest` with quantity 1, show success/warning/error in `src/App.tsx` (FE-C04-001)
- [x] T008 [US1] Implement `CartScreen` loading `GET /api/v1/cart` with loading, retry error, empty, and populated states and totals in `src/App.tsx` (FE-C04-002)

## Phase 4: User Story 2 - Edit the cart and proceed (Priority: P2)

**Goal**: Quantity change, removal, and checkout gating (FE-C04-003, FE-C04-004).

- [x] T009 [P] [US2] Cover quantity update and removal in `src/App.cart.test.tsx`
- [x] T010 [US2] Implement quantity `PATCH` and line `DELETE`, replacing displayed cart with the returned `CartResponse` in `src/App.tsx` (FE-C04-003)
- [x] T011 [US2] Gate checkout: disabled when empty, sign-in prompt with `/checkout` return destination for guests, navigation with a token in `src/App.tsx` and `src/auth/AuthScreens.tsx` (FE-C04-004)
- [x] T012 [US2] Route `/carrito` in `App` in `src/App.tsx`

## Phase N: Polish & Cross-Cutting Concerns

- [x] T013 [P] Document as-built behavior and boundaries in [spec.md](./spec.md)
- [x] T014 [P] Add this retrospective [plan.md](./plan.md) and tasks list

## Evidence (only what the ODD/docs report)

- [`cu-c04-shopping-cart.md`](../../../odd/tasks/cu-c04-shopping-cart.md) reports: `npm run generate:types` completed; `npm test -- --run` 22 tests passed; `npm run build` passed; `npm run lint` completed with the existing single warning. Final suites: Frontend 22 passed.
- Live check on rebuilt containers (BFF/Core side): add, cap with `INSUFFICIENT_STOCK` warning, removal, total recalculation, cookie persistence, no stock reservation.
- Not live-verified per ODD: Frontend UI in a browser (covered by MSW tests) and guest→account merge on login; pending verification.
- The ODD record states no commits were made at that point (delivery strategy pending); Frontend implementation commit identity: pending verification.
- Spec commit `6a615fdd8e72af7b3c838daca8b83b4d76d844a4` (docs only, per [`derive-project-specs.md`](../../../odd/tasks/derive-project-specs.md)).

## Dependencies & Execution Order

Phase 1 → Phase 2 → US1 → US2 → Polish. Checkout itself is covered by [005-checkout-orders-invoice](../005-checkout-orders-invoice/tasks.md).
