# BGG Shop Frontend Constitution

## Scope and precedence

This constitution governs implementation in `bgg-shop-frontend`. The root `.specify/memory/constitution.md` governs shared product and cross-service behavior; this file governs the Frontend's local implementation and cannot redefine that behavior. Existing Frontend behavior remains the compatibility baseline. No constitution automatically authorizes a retroactive behavior or contract change.

## Principles

### 1. Own the browser experience

Keep this repository responsible for the client-side customer experience and browser navigation. Consume backend capabilities through the BFF REST API; do not call Core GraphQL directly or introduce Frontend-owned server endpoints as a substitute for the documented service boundaries.

### 2. Generate API types from the BFF contract

The BFF REST contract at `../bgg-shop-bff/specs/openapi.yaml` is the source for API types. Generate `src/types/generated/bff-api.d.ts` with `npm run generate:types`; do not manually edit or maintain a competing copy of generated contract types. Keep API requests and response handling aligned with that contract.

### 3. Protect browser users and credentials

Keep server-side and payment-provider credentials out of the browser bundle and client storage. Handle authentication data and user-provided values only as required by documented behavior; present failures without exposing internal service details.

### 4. Verify user-facing changes

For each approved change, trace the requirement through the Frontend service specification, the applicable BFF OpenAPI operation, UI implementation, relevant tests under `src/`, and documentation. Run the applicable checks and report only observed results; do not treat task completion as test evidence.
