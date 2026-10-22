# Frontend Functional Specification: Shopping Cart (As-Built)

**Input**: CU-C04
**Status**: As-built / retrospective
**Scope**: Adding products from the catalog and displaying/editing the buyer's cart. Cart identity, persistence, stock capping, and guest-to-account merging belong to the BFF/Core as described in the [canonical CU-C04 specification](../../../specs/004-shopping-cart-as-built/spec.md).

## Frontend responsibilities

| Frontend requirement | Observed UI behavior, BFF request, and evidence |
| --- | --- |
| **FE-C04-001 — Add an available product.** Product cards show current stock and disable the add control when stock is zero. An enabled add sends `POST /api/v1/cart/items` with the product `bgg_id` and quantity 1; the UI shows success, stock-warning, or generic error feedback. | The request uses `CartItemRequest`; the result is a `CartResponse` whose `warnings` can carry stock feedback. [Catalog/cart UI](../../src/App.tsx), [cart messages](../../src/ui/messages.ts), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [generated types](../../src/types/generated/bff-api.d.ts). |
| **FE-C04-002 — Read and present a cart.** `/carrito` loads `GET /api/v1/cart` with `credentials: include` and an Authorization header when a local access token exists. The UI distinguishes loading, failure with retry, empty, and populated states; each line shows name, quantity, current unit price, available stock, subtotal, and the cart total. | `CartResponse` supplies `CartLine[]`, `total`, and `warnings`. The server selects the guest or authenticated cart; the UI does not display or submit a cart identifier. [Cart UI](../../src/App.tsx), [cart messages](../../src/ui/messages.ts), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [generated types](../../src/types/generated/bff-api.d.ts). |
| **FE-C04-003 — Change or remove a line.** The quantity control requires a positive integer and uses current available stock as its input maximum. Submitting sends `PATCH /api/v1/cart/items/{bgg_id}`; removing sends `DELETE` to the same path. The returned cart replaces the displayed lines/totals, and returned warnings are shown as status feedback. | These requests correspond to `CartQuantityRequest`, `CartResponse`, `updateCartItemQuantity`, and `removeCartItem`. The BFF/Core determine accepted quantities and stock warnings. [Cart UI](../../src/App.tsx), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [generated types](../../src/types/generated/bff-api.d.ts), [cart tests](../../src/App.cart.test.tsx). |
| **FE-C04-004 — Gate checkout navigation.** The checkout button is disabled for an empty cart. For a populated guest cart it displays a sign-in prompt and stores `/checkout` as the return destination; with a local access token it navigates to checkout. | Login's guest-cart cookie handling and merge are performed by the BFF/Core, not by a separate Frontend cart merge request. [Cart and app navigation](../../src/App.tsx), [authentication screen](../../src/auth/AuthScreens.tsx), [BFF OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml). |

## Boundaries and observed gaps

- The Frontend sends browser credentials and, when available, the access token. It does not choose cart ownership, expose a cart ID, persist cart lines itself, merge carts, cap a server-accepted quantity, reserve stock, or calculate authoritative prices. Those are server-side behaviors.
- Client-side quantity checks improve input feedback; the BFF/Core remain authoritative for current stock and valid cart mutations. Cart changes do not themselves reserve or decrement inventory.
- The cart tests cover catalog stock display, adding a line, quantity update, removal, empty state, load error, zero-stock disabling, and a BFF stock warning. They do not verify reload persistence, guest-to-account merging, or inventory reservation behavior.

## Verification evidence

- [Canonical end-to-end CU-C04](../../../specs/004-shopping-cart-as-built/spec.md)
- [BFF OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml) and [generated BFF API types](../../src/types/generated/bff-api.d.ts)
- [Catalog/cart implementation](../../src/App.tsx), [cart UI messages](../../src/ui/messages.ts), [login/session handling](../../src/auth/AuthScreens.tsx)
- [Frontend cart tests](../../src/App.cart.test.tsx)
