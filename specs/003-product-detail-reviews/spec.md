# Frontend Functional Specification: Product Detail and Reviews (As-Built)

**Input**: CU-C03
**Status**: As-built / retrospective
**Scope**: Product detail navigation and display, public approved-review presentation, and the buyer review form. Product lookup, authorization, review persistence, and moderation are BFF/Core responsibilities described in the [canonical CU-C03 specification](../../../specs/003-product-detail-reviews-as-built/spec.md).

## Frontend responsibilities

| Frontend requirement | Observed UI behavior, BFF request, and evidence |
| --- | --- |
| **FE-C03-001 — Open detail by product slug.** Selecting “Ver detalles” creates a slug from the product name and opens `/juegos/{slug}`. The screen requests `GET /api/v1/games/{slug}` and presents loading, detail, and error states with a return-to-catalog action. | The request uses the OpenAPI `getGameDetail` operation and generated `ProductDetail` shape. A 404 is given “No encontramos ese juego” copy, but is rendered in the same error container as other load failures. [Product and detail UI](../../src/App.tsx), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [generated types](../../src/types/generated/bff-api.d.ts). |
| **FE-C03-002 — Display detail and public approved reviews.** The screen shows image, name, publisher, year, player range, duration, age, current stock, and price. It displays the approved-review count and average, approved review bodies, ratings and dates, or an empty-approved-review message. | `ProductDetail` contains `review_summary` and `approved_reviews`; the browser renders only those returned entries and summary values. Which reviews are approved and the summary calculation are BFF/Core responsibilities. [Product detail UI](../../src/App.tsx), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [generated types](../../src/types/generated/bff-api.d.ts). |
| **FE-C03-003 — Collect and submit a review.** The form offers ratings 1–5 and a required text field limited to 2000 characters. The browser trims the body, requires a local session token, then posts `{ rating, body }` to `POST /api/v1/games/{slug}/reviews` with an Authorization header. Success shows pending-moderation confirmation, clears the text, and displays a temporary status message. | The request and response types are `CreateReviewRequest` and `CreateReviewResponse`; the operation is `createGameReview`. Error codes are mapped to buyer-facing text. [Product detail UI](../../src/App.tsx), [review messages](../../src/ui/messages.ts), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [generated types](../../src/types/generated/bff-api.d.ts). |

## Boundaries and observed gaps

- The Frontend presents form validation and service outcomes. The BFF/Core enforce authentication, product existence, rating/body bounds, duplicate-review policy, pending status, and which reviews may be public.
- An unauthenticated review attempt produces a sign-in prompt as form feedback; the current detail screen does not link to or navigate to `/login` from that message.
- Although the detail response includes weight and category, the current detail view does not display them. The “not found” result is also not a distinct screen from other detail-load errors.
- The Frontend source contains no dedicated detail/review test file, and `App.test.tsx` covers the catalog rather than detail navigation or review submission. These interactions are not claimed as Frontend-tested here.
- Review moderation, approval, and adding a newly pending review to the public list are not Frontend responsibilities.

## Verification evidence

- [Canonical end-to-end CU-C03](../../../specs/003-product-detail-reviews-as-built/spec.md)
- [BFF OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml) and [generated BFF API types](../../src/types/generated/bff-api.d.ts)
- [Product, detail, and review implementation](../../src/App.tsx), [review messages](../../src/ui/messages.ts)
- [Frontend application tests](../../src/App.test.tsx) (catalog coverage only; no detail/review scenario)
