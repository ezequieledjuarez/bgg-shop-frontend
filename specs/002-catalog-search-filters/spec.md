# Frontend Functional Specification: Catalog Search and Filters (As-Built)

**Input**: CU-C02
**Status**: As-built / retrospective
**Scope**: Public catalog loading, client-side search/filter controls, result presentation, and local ordering. Search semantics and catalog filtering are supplied by the BFF/Core as described in the [canonical CU-C02 specification](../../../specs/002-catalog-search-filters-as-built/spec.md).

## Frontend responsibilities

| Frontend requirement | Observed UI behavior, BFF request, and evidence |
| --- | --- |
| **FE-C02-001 — Load and present the public catalog.** The catalog makes an unauthenticated `GET /api/v1/products` request for `page=1&page_size=100`. Product cards present name, publisher, category label, release year, player range, play time, age, price, image, and current stock. | The response is typed as `ProductPage` containing `Product` items. The endpoint is `listProducts` in OpenAPI. [Catalog UI](../../src/App.tsx), [generated types](../../src/types/generated/bff-api.d.ts), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [catalog tests](../../src/App.test.tsx). |
| **FE-C02-002 — Submit available search and filters.** Search is applied on form submission, not each keystroke. Year, minimum/maximum players, and minimum/maximum price are included in the next request when set, as `year_published`, `min_players`, `max_players`, `price_min`, and `price_max`. | These are query parameters of `GET /api/v1/products`; BFF filtering and validation are not reimplemented in the browser. [Catalog UI](../../src/App.tsx), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [generated `ProductPage` and `Product` types](../../src/types/generated/bff-api.d.ts), [catalog tests](../../src/App.test.tsx). |
| **FE-C02-003 — Render catalog states and let the buyer recover.** The screen distinguishes loading, request error, zero results, and product results. Errors offer retry; an empty result offers a clear-filters action. Clearing resets the search, numeric criteria, and local ordering. | The page uses the `ProductPage.items` returned by the BFF. An invalid or failed BFF request is displayed as a catalog error, not as an empty result. [Catalog UI](../../src/App.tsx), [catalog tests](../../src/App.test.tsx). |
| **FE-C02-004 — Order the current results locally.** The selector offers ascending price, descending price, and “Recomendados”; price ordering is performed in the browser and does not trigger a BFF request. | The OpenAPI `Product` schema has no featured field or relevance-ranking operation. The UI adds an optional `featured` property to its local product type and sorts by it for “Recomendados”; no server ranking is asserted. [Catalog UI](../../src/App.tsx), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [generated types](../../src/types/generated/bff-api.d.ts), [catalog tests](../../src/App.test.tsx). |

## Boundaries and observed gaps

- The current UI has no category control and does not send `category_id`, although the BFF contract supports that parameter and the canonical end-to-end behavior includes category filtering.
- The UI does not check inverted player or price ranges before requesting. Those values are sent to the BFF, which owns input validation; the current Frontend error presentation is a general catalog error with retry, rather than field-specific validation feedback.
- The client requests only the first page, with a page size of 100. It shows a count of the items currently returned, not page navigation or a total-count pagination interface.
- “Recomendados” depends on an optional local `featured` property absent from the generated `Product` type and OpenAPI schema. No relevance algorithm or consistent featured values are evidenced.
- Frontend tests verify initial loading/rendering, submitted search and supported numeric filters, empty-state recovery, request failure, and local price sorting. They do not verify category filtering, invalid-range feedback, pagination, or featured ordering.

## Verification evidence

- [Canonical end-to-end CU-C02](../../../specs/002-catalog-search-filters-as-built/spec.md)
- [BFF OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml) and [generated BFF API types](../../src/types/generated/bff-api.d.ts)
- [Catalog implementation](../../src/App.tsx)
- [Frontend catalog tests](../../src/App.test.tsx)
