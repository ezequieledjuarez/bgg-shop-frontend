# Implementation Plan: Wishlist (As-Built)

**Branch**: `006-wishlist` (retrospective; implemented on `CU-06-wishlist`) | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-wishlist/spec.md`

**Note**: Retrospective plan documenting the existing Frontend implementation of CU-C06.

## Summary

On the product detail page, "Guardar en mi lista de deseos" posts `{ bgg_id }` to `POST /api/v1/wishlist`, using the `bgg_id` returned by `ProductDetail` so direct `/juegos/{slug}` URLs work without a query parameter. An unauthenticated buyer is sent through the existing login flow and returned to the previous route. `/wishlist` (`WishlistScreen`) lists items (`GET /api/v1/wishlist`), removes them (`DELETE /api/v1/wishlist/{bgg_id}`, view updated only after BFF confirmation), and adds them to the cart (`POST /api/v1/cart/items`, quantity 1) without removing them from the list. All requests use the stored bearer token; no user identifier is sent.

## Technical Context

**Language/Version**: TypeScript ~5.4, React 19
**Primary Dependencies**: Vite 5, `openapi-typescript` (types from [`openapi.yaml`](../../../bgg-shop-bff/specs/openapi.yaml))
**Storage**: Browser `sessionStorage` for the session token and pending return route; wishlist data lives in Core
**Testing**: Vitest, Testing Library, MSW (`src/App.wishlist.test.tsx`)
**Target Platform**: Modern browsers
**Project Type**: Web application (Frontend only; consumes the BFF)
**Performance Goals**: N/A
**Constraints**: Spanish UI copy; accessible button names; buttons disabled during operations; no cleanup logic in the Frontend (Core removes purchased items after a paid confirmation)
**Scale/Scope**: 1 screen (`src/wishlist/WishlistScreen.tsx`), a save action in `ProductDetailScreen`, a navigation link and route in `src/App.tsx`

## Constitution Check

*Checked retrospectively against [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md).*

- Generate API types from the BFF contract: PASS (`WishlistAddRequest` and related schemas from `src/types/generated/bff-api.d.ts`).
- Protect browser users and credentials: PASS (bearer token only; no user id in requests).
- Verify user-facing changes: tests in `src/App.wishlist.test.tsx`; see [tasks.md](./tasks.md).

## Project Structure

### Documentation (this feature)

```text
specs/006-wishlist/
├── spec.md
├── plan.md              # This file
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── App.tsx                         # saveToWishlist in ProductDetailScreen, /wishlist route, nav link, login return
├── wishlist/
│   └── WishlistScreen.tsx          # List, remove, add-to-cart, loading/error/empty states
├── App.wishlist.test.tsx           # Wishlist tests
└── types/generated/bff-api.d.ts    # Wishlist and ProductDetail.bgg_id types
```

**Structure Decision**: Wishlist UI in its own `src/wishlist/` module; save action stays inside the existing detail screen.

## Traceability and Evidence

- Root as-built spec for this use case: pending verification (`../../../specs/006-wishlist-as-built/spec.md` is produced by a separate task in [`regenerate-plan-tasks.md`](../../../odd/tasks/regenerate-plan-tasks.md)).
- BFF contract: [`openapi.yaml`](../../../bgg-shop-bff/specs/openapi.yaml).
- ODD record: [`cu-c06-wishlist.md`](../../../odd/tasks/cu-c06-wishlist.md).

## Complexity Tracking

No constitution violations to justify.
