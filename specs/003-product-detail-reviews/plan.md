# Implementation Plan: Product Detail and Reviews (As-Built)

**Branch**: `003-product-detail-reviews` (retrospective) | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-product-detail-reviews/spec.md`

**Note**: Retrospective plan documenting the existing Frontend implementation of CU-C03.

## Summary

Selecting "Ver detalles" opens `/juegos/{slug}`; `ProductDetailScreen` requests `GET /api/v1/games/{slug}` and shows detail, review summary, and approved reviews. An authenticated buyer can submit `{ rating, body }` to `POST /api/v1/games/{slug}/reviews` with the bearer token; success shows a pending-moderation confirmation. Moderation and review persistence are BFF/Core concerns.

## Technical Context

**Language/Version**: TypeScript ~5.4, React 19
**Primary Dependencies**: Vite 5, `openapi-typescript`
**Storage**: Reads the access token from `sessionStorage` (`bgg-shop.session`)
**Testing**: Vitest, Testing Library, MSW; no dedicated detail/review test file exists
**Target Platform**: Modern browsers
**Project Type**: Web application (Frontend only; consumes the BFF)
**Performance Goals**: N/A
**Constraints**: Rating 1–5, body trimmed and limited to 2000 characters; 404 and other load errors share one error container; detail view does not show weight or category
**Scale/Scope**: `ProductDetailScreen` plus slug navigation in `src/App.tsx`

## Constitution Check

*Checked retrospectively against [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md).*

- Generate API types from the BFF contract: PASS (`ProductDetail`, `CreateReviewRequest`, `CreateReviewResponse` in `src/types/generated/bff-api.d.ts`).
- Protect browser users and credentials: PASS for header-based bearer use; error codes are mapped to buyer-facing copy in `src/ui/messages.ts`.
- Verify user-facing changes: PARTIAL; detail and review interactions are not covered by Frontend tests (see [tasks.md](./tasks.md)).

## Project Structure

### Documentation (this feature)

```text
specs/003-product-detail-reviews/
├── spec.md
├── plan.md              # This file
└── tasks.md
```

### Source Code (repository root)

```text
src/
├── App.tsx                         # slugify, ProductCard, ProductDetailScreen, /juegos/{slug} route
├── ui/messages.ts                  # Review error and status copy
└── types/generated/bff-api.d.ts    # ProductDetail, CreateReview*
```

**Structure Decision**: Single Vite/React project; detail and review UI live in `src/App.tsx`.

## Traceability and Evidence

- Root canonical spec: [003-product-detail-reviews-as-built](../../../specs/003-product-detail-reviews-as-built/spec.md).
- BFF contract: [`openapi.yaml`](../../../bgg-shop-bff/specs/openapi.yaml) (`getGameDetail`, `createGameReview`).
- ODD record: [`cu-c03-product-reviews.md`](../../../odd/tasks/cu-c03-product-reviews.md); docs: [`CU-C03-REVIEWS.md`](../../../docs/CU-C03-REVIEWS.md), [`CU-C01-C03-E2E-VALIDATION.md`](../../../docs/CU-C01-C03-E2E-VALIDATION.md).

## Complexity Tracking

No constitution violations to justify.
