# Frontend Functional Specification: Catalog Search and Filters (As-Built)

**Input**: CU-C02
**Status**: Closed and validated with exceptions on 2026-10-30; see the [canonical closure](../../../specs/002-catalog-search-filters-as-built/spec.md).
**Scope**: Public catalog loading, client-side search/filter controls, result presentation, and local ordering. Search semantics and catalog filtering are supplied by the BFF/Core as described in the [canonical CU-C02 specification](../../../specs/002-catalog-search-filters-as-built/spec.md).

## Frontend responsibilities

| Frontend requirement | Observed UI behavior, BFF request, and evidence |
| --- | --- |
| **FE-C02-001 — Load and present the public catalog.** The catalog makes unauthenticated `GET /api/v1/products` requests with the selected page and `page_size=100`, and shows navigation and the total count. Product cards present name, publisher, category label, release year, player range, play time, age, price, image, and current stock. | The response is typed as `ProductPage` containing `Product` items. The endpoint is `listProducts` in OpenAPI. [Catalog UI](../../src/App.tsx), [generated types](../../src/types/generated/bff-api.d.ts), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [catalog tests](../../src/App.test.tsx). |
| **FE-C02-002 — Submit available search and filters.** Search is applied on form submission, not each keystroke. Year, category, minimum/maximum players, and minimum/maximum price are sent as `year_published`, `category_name`, `min_players`, `max_players`, `price_min`, and `price_max`. Category options are loaded from `GET /api/v1/product-categories`; a failed load can be retried. | Filtering remains in BFF/Core; the browser also checks inverted ranges before requesting. [Catalog UI](../../src/App.tsx), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [Core resolver](../../../bgg-shop-core/saleor/graphql/api.py), [catalog tests](../../src/App.test.tsx). |
| **FE-C02-003 — Render catalog states and let the buyer recover.** The screen distinguishes loading, request error, zero results, and product results. Errors offer retry; an empty result offers a clear-filters action. Clearing resets the search, category, numeric criteria, and local ordering. | The page uses the `ProductPage.items` returned by the BFF. An invalid or failed BFF request is displayed as a catalog error, not as an empty result. [Catalog UI](../../src/App.tsx), [catalog tests](../../src/App.test.tsx). |
| **FE-C02-004 — Order the current page locally.** The selector offers catalog order and ascending or descending price for the displayed page; sorting does not trigger a BFF request. “Recomendados” is deferred and not displayed. | No global price sorting or relevance-ranking operation is claimed. [Catalog UI](../../src/App.tsx), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [catalog tests](../../src/App.test.tsx). |

## Boundaries and observed gaps

- The category selector loads the distinct names currently present in Core product data. The options refresh when the page loads or the category request is retried.
- The UI detects inverted player and price ranges, identifies the affected fields, and does not request products until the range is corrected. BFF validation remains the service boundary for direct requests.
- The client requests pages of 100 products and displays the BFF total and previous/next navigation. Changing filters resets the page to one; price sorting affects only the current page.
- “Recomendados” is deferred; its criteria and implementation remain to be decided.
- At a 320 px viewport, the header and hero cause horizontal page overflow; the pagination controls themselves fit within the viewport.
- [Component tests](../../src/App.test.tsx) use mocked responses. [E2E tests](../../tests/e2e/catalog-filters.spec.ts) exercise representative filter combinations, pagination, and invalid-range recovery against local services, not all possible combinations.

## Verification evidence

- [Canonical end-to-end CU-C02](../../../specs/002-catalog-search-filters-as-built/spec.md)
- [BFF OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml) and [generated BFF API types](../../src/types/generated/bff-api.d.ts)
- [Catalog implementation](../../src/App.tsx)
- [Frontend catalog tests](../../src/App.test.tsx)
- [Catalog E2E tests](../../tests/e2e/catalog-filters.spec.ts)
