# Implementation Plan: Shopping Cart (As-Built)

**Branch**: `004-shopping-cart` (retrospective; ODD records branch `CU-04`) | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-shopping-cart/spec.md`

**Note**: Retrospective plan documenting the existing Frontend implementation of CU-C04.

## Summary

Product cards show current stock and disable the add control at zero stock; adding sends `POST /api/v1/cart/items` with `bgg_id` and quantity 1. `/carrito` (`CartScreen`) loads `GET /api/v1/cart` with `credentials: include` and the bearer token when present, and supports quantity change (`PATCH /api/v1/cart/items/{bgg_id}`) and removal (`DELETE`). Checkout navigation is gated: empty cart disabled, guest prompted to sign in with `/checkout` stored as return destination. Cart ownership, persistence, merging, and stock capping are BFF/Core responsibilities.

## Technical Context

**Language/Version**: TypeScript ~5.4, React 19
**Primary Dependencies**: Vite 5, `openapi-typescript`
**Storage**: Browser `sessionStorage` only for the session token and return destination; cart state is server-side
**Testing**: Vitest, Testing Library, MSW (`src/mocks/handlers.ts` includes cart handlers)
**Target Platform**: Modern browsers
**Project Type**: Web application (Frontend only; consumes the BFF)
**Performance Goals**: N/A
**Constraints**: No cart identifier is shown or sent; requests carry browser credentials; the Frontend does not reserve stock, merge carts, or compute authoritative prices
**Scale/Scope**: `ProductCard` add action and `CartScreen` in `src/App.tsx`

## Constitution Check

*Checked retrospectively against [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md).*

- Generate API types from the BFF contract: PASS (`CartItemRequest`, `CartQuantityRequest`, `CartResponse`, `CartLine`).
- Protect browser users and credentials: PASS (cookie plus optional bearer; no cart ID exposed).
- Verify user-facing changes: tests in `src/App.cart.test.tsx`; see [tasks.md](./tasks.md).

## Project Structure

### Documentation (this feature)

```text
specs/004-shopping-cart/
├── spec.md
├── plan.md              # This file
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── App.tsx                         # ProductCard, cartRequestOptions, CartScreen, checkout gating
├── App.cart.test.tsx               # Cart tests
├── mocks/handlers.ts               # MSW cart handlers (GET/POST/PATCH/DELETE)
├── auth/AuthScreens.tsx            # Login return destination handling
├── ui/messages.ts                  # Spanish cart copy
└── types/generated/bff-api.d.ts    # Cart types
```

**Structure Decision**: Single Vite/React project; cart UI sits in `src/App.tsx` with shared request options.

## Traceability and Evidence

- Root canonical spec: [004-shopping-cart-as-built](../../../specs/004-shopping-cart-as-built/spec.md).
- BFF contract: [`openapi.yaml`](../../../bgg-shop-bff/specs/openapi.yaml) (`updateCartItemQuantity`, `removeCartItem`).
- ODD record: [`cu-c04-shopping-cart.md`](../../../odd/tasks/cu-c04-shopping-cart.md); docs: [`CU-C04-SHOPPING-CART.md`](../../../docs/CU-C04-SHOPPING-CART.md).

## Complexity Tracking

No constitution violations to justify.
