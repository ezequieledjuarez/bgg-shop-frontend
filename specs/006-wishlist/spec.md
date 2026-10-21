# CU-C06 — Wishlist

## Objective and route

Wishlist allows an authenticated buyer to save games, view them again, remove
them, or add them to the cart. The view is available at `/wishlist`.
`ProductDetail` includes the public `bgg_id` in the BFF response, and the save
action uses that field instead of relying on a query parameter during detail
navigation.

## Flows

1. On the detail page, **Guardar en mi lista de deseos** calls
   `POST /api/v1/wishlist` with `{ "bgg_id": number }`.
2. If no session exists, the application opens the existing login flow and
   preserves the detail destination. After login, the buyer returns to the
   detail page and can complete the action.
3. Opening `/wishlist` calls `GET /api/v1/wishlist`. If the buyer is
   unauthenticated, the route is preserved while login is requested.
4. The remove action calls `DELETE /api/v1/wishlist/{bgg_id}` and updates the
   view only after the BFF confirms the operation.
5. **Agregar al carrito** calls `POST /api/v1/cart/items` with quantity one.
   The operation does not remove the Wishlist item; stock or error messages are
   shown alongside the item that remains in the list.
6. Core owns cleanup after a paid purchase; this does not change the Frontend's
   CU-C05 checkout flow.

## Contract and visible states

All three operations use the BFF and the bearer token stored by the existing
session. No request sends a user identifier. Request and response types are
derived from `src/types/generated/bff-api.d.ts`, generated from the BFF
OpenAPI contract.

The view distinguishes loading, retryable error, empty list, and populated
list states. Mutations announce success, errors, or stock warnings. Buttons
have accessible names, are disabled during operations, and retain native focus
order. User-facing UI copy remains in Spanish.

## Product detail identity

The BFF `ProductDetail` response exposes the public BoardGameGeek identifier as
the required `bgg_id` field. The Wishlist save action reads that value from the
detail response, so it works for both catalog navigation and direct
`/juegos/{slug}` URLs. Existing detail URLs with a `bgg_id` query parameter
remain compatible.

## Tests

`src/App.wishlist.test.tsx` covers authenticated saves, returning from login,
protected navigation, empty and populated lists, removing items, adding items
to the cart without removing them from Wishlist, loading and stock errors, and
catalog navigation. It also covers saving from a direct detail URL without a
`bgg_id` query parameter.
