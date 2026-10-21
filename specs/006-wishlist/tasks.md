# Tasks: Wishlist (As-Built)

**Input**: Design documents from `/specs/006-wishlist/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md)

**Tests**: Included; `src/App.wishlist.test.tsx` exists.

**Organization**: Retrospective. All tasks are `[x]` because the code exists. Completion is not verification; see Evidence.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Regenerate types with `npm run generate:types` into `src/types/generated/bff-api.d.ts` (wishlist operations and `ProductDetail.bgg_id`)

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T002 Reuse `cartRequestOptions` (bearer token, credentials) and `apiBaseUrl` for wishlist calls in `src/App.tsx`
- [x] T003 Add `/wishlist` route, authenticated navigation link, and login return to `/wishlist` in `src/App.tsx`

## Phase 3: User Story 1 - Save a game from its detail (Priority: P1) 🎯 MVP

**Goal**: Save from the detail page, including direct `/juegos/{slug}` URLs.

**Independent Test**: Save tests in `src/App.wishlist.test.tsx`.

- [x] T004 [P] [US1] Cover authenticated save, save from a direct detail URL without a `bgg_id` query parameter, and anonymous save via login with return in `src/App.wishlist.test.tsx`
- [x] T005 [US1] Implement `saveToWishlist` posting `WishlistAddRequest` `{ bgg_id }` using the `ProductDetail` identifier, with submitting/success/error states, in `src/App.tsx`
- [x] T006 [US1] Preserve the detail destination through login when no session exists in `src/App.tsx`

## Phase 4: User Story 2 - View and manage the Wishlist (Priority: P2)

**Goal**: List, remove, and add to cart from `/wishlist`.

- [x] T007 [P] [US2] Cover protected navigation, empty/populated lists, removal, loading and API errors, invalid session return, and nav link in `src/App.wishlist.test.tsx`
- [x] T008 [US2] Implement `WishlistScreen` with `GET /api/v1/wishlist` and loading, retryable error, empty, and populated states in `src/wishlist/WishlistScreen.tsx`
- [x] T009 [US2] Implement removal via `DELETE /api/v1/wishlist/{bgg_id}`, updating the view only after BFF confirmation, in `src/wishlist/WishlistScreen.tsx`
- [x] T010 [P] [US2] Cover adding to cart without removing from Wishlist and stock errors in `src/App.wishlist.test.tsx`
- [x] T011 [US2] Implement add-to-cart (`POST /api/v1/cart/items`, quantity 1) keeping the item in the list and showing stock/error messages in `src/wishlist/WishlistScreen.tsx`

## Phase N: Polish & Cross-Cutting Concerns

- [x] T012 [P] Document the as-built behavior in [spec.md](./spec.md)
- [x] T013 [P] Add this retrospective [plan.md](./plan.md) and tasks list

## Evidence (only what the ODD/docs report)

- [`cu-c06-wishlist.md`](../../../odd/tasks/cu-c06-wishlist.md) reports: Frontend commit `fbb6202` (`feat(frontend): add authenticated wishlist flow`) on `CU-06-wishlist`; focused/full Frontend tests, lint, and build passed (risk tier medium); final cross-service verification: Frontend 54 tests passed, build passed, lint passed with 11 warnings, `git diff --check` passed.
- No live Core/PostgreSQL integration was run and the OpenAPI parser/validator was unavailable (per the ODD record); live end-to-end Wishlist flow in a browser: pending verification.
- Server-side cleanup of purchased items is a Core behavior and is not verified by Frontend tests.

## Dependencies & Execution Order

Phase 1 → Phase 2 → US1 → US2 → Polish. Uses the cart from [004-shopping-cart](../004-shopping-cart/tasks.md) and login from [001-authentication](../001-authentication/tasks.md).
