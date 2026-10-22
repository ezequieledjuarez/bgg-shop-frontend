# Tasks: Checkout, Orders, and Invoice (As-Built)

**Input**: Design documents from `/specs/005-checkout-orders-invoice/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md)

**Tests**: Included; `src/App.checkout.test.tsx` and `src/checkout/navigation.test.ts` exist.

**Organization**: Retrospective. All tasks are `[x]` because the code exists. Completion is not verification; see Evidence.

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Configure the Vite/React/TypeScript project in `package.json`, `vite.config.ts`, `tsconfig.app.json`
- [x] T002 [P] Regenerate purchase types with `npm run generate:types` into `src/types/generated/bff-api.d.ts`

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T003 Implement `apiBaseUrl`, `purchaseAccessToken`, `purchaseRequestOptions`, `orderError`, `confirmPayment`, `downloadInvoice` in `src/checkout/api.ts`
- [x] T004 [P] Implement `isAllowedPaymentUrl` and `redirectToPayment` (HTTPS Mercado Pago/Libre hosts only) in `src/checkout/navigation.ts`
- [x] T005 [P] Add Spanish purchase copy in `src/ui/messages.ts`
- [x] T006 Route `/checkout`, `/compra/resultado`, `/mis-compras`, `/mis-compras/{order_id}` in `src/App.tsx`

## Phase 3: User Story 1 - Checkout and pay (Priority: P1) 🎯 MVP

**Goal**: Start checkout and navigate to payment (FE-C05-001, FE-C05-002).

**Independent Test**: Run `src/App.checkout.test.tsx` and `src/checkout/navigation.test.ts`.

- [x] T007 [P] [US1] Cover checkout submission and error mapping in `src/App.checkout.test.tsx`
- [x] T008 [P] [US1] Cover redirect URL validation in `src/checkout/navigation.test.ts`
- [x] T009 [US1] Implement `CheckoutScreen` (token required, standard delivery fields, pickup mode, pending state, `POST /api/v1/checkout`) in `src/checkout/CheckoutScreen.tsx` (FE-C05-001)
- [x] T010 [US1] Map known error codes and network errors, and redirect to `init_point` through the helper, in `src/checkout/CheckoutScreen.tsx` (FE-C05-002)

## Phase 4: User Story 2 - Payment result and retry (Priority: P2)

**Goal**: Confirm the return and show the order state (FE-C05-003).

- [x] T011 [P] [US2] Cover paid, rejected, pending, and retry states in `src/App.checkout.test.tsx`
- [x] T012 [US2] Implement `PurchaseResultScreen` posting `ConfirmPaymentRequest` to `/api/v1/checkout/confirm`, with pending re-check and rejected retry in `src/checkout/OrdersScreen.tsx`

## Phase 5: User Story 3 - History, detail, and invoice (Priority: P3)

**Goal**: Order history/detail and invoice download (FE-C05-004, FE-C05-005).

- [x] T013 [P] [US3] Cover order list/detail and invoice download in `src/App.checkout.test.tsx`
- [x] T014 [US3] Implement `OrdersScreen` for `GET /api/v1/orders` and `GET /api/v1/orders/{order_id}` with loading, error/retry, empty, list, detail, and not-found states in `src/checkout/OrdersScreen.tsx`
- [x] T015 [US3] Implement `InvoiceButton` downloading the PDF Blob from `GET /api/v1/orders/{order_id}/invoice` in `src/checkout/OrdersScreen.tsx`

## Phase N: Polish & Cross-Cutting Concerns

- [x] T016 [P] Document as-built behavior and gaps (`cancelled` falls through to pending, no live provider verification) in [spec.md](./spec.md)
- [x] T017 [P] Add this retrospective [plan.md](./plan.md) and tasks list

## Evidence (only what the ODD/docs report)

- [`cu-c05-purchase.md`](../../../odd/tasks/cu-c05-purchase.md) reports: Frontend suite 35 passed at implementation time and 43 passed in final suites; `npm run generate:types` succeeded; `npm run build` passed; `npm run lint` passed with one pre-existing set-state-in-effect warning. Independent review found an unvalidated `init_point` redirect, fixed with the allowlist plus tests.
- Frontend commit `fe4ae1e` (`feat(orders): add checkout, payment result and purchase history views`) on `CU-05`, per the ODD record.
- Live validation was partial and backend-side (checkout via BFF produced a `pending_payment` order and a sandbox `init_point`). Browser payment with the Mercado Pago test buyer, `paid` transition, invoice PDF download, and cart clearing: pending verification; the ODD item `cu-c05-flow-validation` is unchecked.
- Cancelled-status presentation: pending verification (not tested).
- Spec commit `6a615fdd8e72af7b3c838daca8b83b4d76d844a4` (docs only, per [`derive-project-specs.md`](../../../odd/tasks/derive-project-specs.md)).

## Dependencies & Execution Order

Phase 1 → Phase 2 → US1 → US2 → US3 → Polish. Requires the cart from [004-shopping-cart](../004-shopping-cart/tasks.md).
