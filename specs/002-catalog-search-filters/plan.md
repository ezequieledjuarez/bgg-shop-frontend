# Implementation Plan: Catalog Search and Filters (As-Built)

**Branch**: `002-catalog-search-filters` (retrospective) | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-catalog-search-filters/spec.md`

**Note**: Retrospective plan documenting the existing Frontend implementation of CU-C02.

## Summary

The home catalog loads `GET /api/v1/products?page=1&page_size=100` from the BFF and renders product cards. Search text is applied on form submit; year, player-range, and price-range filters are added to the next request as `year_published`, `min_players`, `max_players`, `price_min`, and `price_max`. The screen distinguishes loading, error (with retry), empty (with clear filters), and result states. Price ordering and "Recomendados" are applied locally in the browser.

## Technical Context

**Language/Version**: TypeScript ~5.4, React 19
**Primary Dependencies**: Vite 5, `openapi-typescript` (types from the BFF OpenAPI)
**Storage**: N/A
**Testing**: Vitest, Testing Library, jsdom, MSW (`src/mocks/handlers.ts`)
**Target Platform**: Modern browsers
**Project Type**: Web application (Frontend only; consumes the BFF REST API, never Core GraphQL)
**Performance Goals**: N/A
**Constraints**: Only the first page (`page_size=100`) is requested; no pagination UI; no `category_id` control; filtering and validation stay in the BFF/Core
**Scale/Scope**: One catalog screen inside `CatalogApp` and `ProductCard` in `src/App.tsx`

## Constitution Check

*Checked retrospectively against [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md).*

- Generate API types from the BFF contract: PASS for `Product` and `ProductPage`; the local `featured` property used by "Recomendados" is absent from the generated type (documented gap in the spec).
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
