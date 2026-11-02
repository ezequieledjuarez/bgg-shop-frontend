# Implementation Plan: Catalog Search and Filters (As-Built)

**Branch**: `002-catalog-search-filters` (retrospective) | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-catalog-search-filters/spec.md`
**Status**: Closed with exceptions on 2026-10-30; see the [canonical closure](../../../specs/002-catalog-search-filters-as-built/spec.md).

**Note**: Retrospective plan documenting the existing Frontend implementation of CU-C02.

## Summary

The home catalog requests 100-product pages from `GET /api/v1/products` and category names from `GET /api/v1/product-categories`. Search text is applied on form submit; category, year, player-range, and price-range filters are sent as `category_name`, `year_published`, `min_players`, `max_players`, `price_min`, and `price_max`. Invalid ranges are explained before requesting. Price ordering applies locally to the current page; "Recomendados" is deferred.

## Technical Context

**Language/Version**: TypeScript ~5.4, React 19
**Primary Dependencies**: Vite 5, `openapi-typescript` (types from the BFF OpenAPI)
**Storage**: N/A
**Testing**: Vitest, Testing Library, jsdom, MSW (`src/mocks/handlers.ts`)
**Target Platform**: Modern browsers
**Project Type**: Web application (Frontend only; consumes the BFF REST API, never Core GraphQL)
**Performance Goals**: N/A
**Constraints**: Pages contain at most 100 products; price sorting is local to each page; category names come from product data; BFF/Core remain the authoritative filtering and validation boundary.
**Scale/Scope**: One catalog screen inside `CatalogApp` and `ProductCard` in `src/App.tsx`

## Constitution Check

*Checked retrospectively against [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md).*

- Generate API types from the BFF contract: PASS for `Product` and `ProductPage`; recommendations remain deferred.
- Own the browser experience: PASS (state handling and local ordering in `src/App.tsx`).
- Verify user-facing changes: tests in `src/App.test.tsx`; see [tasks.md](./tasks.md).

## Project Structure

### Documentation (this feature)

```text
specs/002-catalog-search-filters/
├── spec.md
├── plan.md              # This file
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── App.tsx                         # CatalogApp, ProductCard, filters, ordering
├── App.test.tsx                    # Catalog tests
├── mocks/handlers.ts               # MSW handler for GET */api/v1/products
├── ui/messages.ts                  # Spanish copy
└── types/generated/bff-api.d.ts    # Product, ProductPage
```

**Structure Decision**: Single Vite/React project; the catalog lives in `src/App.tsx` alongside other screens.

## Traceability and Evidence

- Root canonical spec: [002-catalog-search-filters-as-built](../../../specs/002-catalog-search-filters-as-built/spec.md).
- BFF contract: [`openapi.yaml`](../../../bgg-shop-bff/specs/openapi.yaml) (`listProducts`).
- ODD record: [`cu-c02-catalog-filtering.md`](../../../odd/tasks/cu-c02-catalog-filtering.md); technical record: [`CU-C02-FILTERING-CHANGES.md`](../../../docs/CU-C02-FILTERING-CHANGES.md).

## Complexity Tracking

No constitution violations to justify.
