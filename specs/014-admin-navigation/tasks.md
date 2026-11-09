# Tasks: Admin Navigation and Discoverability — Frontend

**Master backlog**: [orchestrator tasks](../../../specs/014-admin-navigation/tasks.md)<br>
**Status**: T009–T015 complete for the scoped feature slice; T012 passed isolated local Frontend→BFF→Core verification. See the [master evidence ledger](../../../specs/014-admin-navigation/quickstart.md).<br>
**Scope**: Local environments only.

This service document contains only Frontend-owned tasks. IDs, statuses, and dependencies match the master backlog. API types are generated from the BFF OpenAPI by `npm run generate:types`; never edit `src/types/generated/bff-api.d.ts` manually.

| ID | Owner | Status | Depends on | Trace |
|---|---|---|---|---|
| T003 | Frontend | DONE — investigation only | — | FR-001–FR-010, FR-013; US1–US5 |
| T009 | Frontend | DONE — generated types | T006 | FR-001–FR-002, FR-008, FR-011; US1, US3–US4 |
| T010 | Frontend | DONE — tests observed RED/GREEN | T009, T003 | FR-001–FR-010, FR-013; US1–US5 |
| T011 | Frontend | DONE — implementation | T010, T008 | FR-001–FR-010, FR-013; US1–US5 |
| T012 | Frontend | DONE — scoped local integration verified | T011, T008, T015 | FR-001–FR-017; US1–US6; SC-001–SC-012 |
| T013 | Frontend | DONE — styling inventory and assertions | T003 | FR-014–FR-017; US6; SC-009–SC-012 |
| T014 | Frontend | DONE — shared and panel styling | T013 | FR-014–FR-017; US6; SC-009–SC-012 |
| T015 | Frontend | DONE — local visual and accessibility verification | T014 | FR-014–FR-017; US6; SC-009–SC-012 |

## Frontend-owned tasks

- [x] **T003 [Frontend] [DONE — investigation only]** Inventory current storefront navigation, admin route handling, session events, and reusable admin panels. **Evidence**: `src/App.tsx:708-724` has no administration entry; `src/App.tsx:880-889` gates admin routes by token presence; `src/admin/AdminRouter.tsx:1-34` renders the existing navigation only at `/admin`. Product, coupon, and user panels already exist. **Trace**: FR-001–FR-010, FR-013; US1–US5.
- [x] **T009 [Frontend] [DONE — generated types]** Ran `npm run generate:types` after T006 promoted the canonical BFF OpenAPI contract; `CurrentUserCapabilities` derives exactly `{ is_staff: boolean; is_superuser: boolean }`. Generated output was not edited manually. **Depends on**: T006. **Trace**: FR-001–FR-002, FR-008, FR-011; US1, US3–US4.
- [x] **T010 [Frontend] [DONE — tests observed RED/GREEN]** Added deterministic role, shared-shell, direct-route, denied-Users, loading/error/malformed/401/502/network/retry, logout/session-race/denial, and product/coupon route tests. The initial focused run observed 13 failing tests and 1 passing before implementation; all focused and full-suite tests subsequently passed. **Depends on**: T009, T003. **Runner**: `npm run test -- --run src/App.admin-navigation.test.tsx src/admin/AdminRouter.test.tsx`; focused final tests and complete suite are recorded in [quickstart](../../../specs/014-admin-navigation/quickstart.md). **Trace**: FR-001–FR-010, FR-013; US1–US5.
- [x] **T011 [Frontend] [DONE — implementation]** Added current-user-backed storefront entry and shared role-aware shell, fail-closed pending/error/forbidden routes, in-memory invalidation/revalidation, and guarded all admin URLs. Reused the eight existing modules without modifying service authorization. **Depends on**: T010, T008. **Checks**: `npm run test -- --run src/App.admin-navigation.test.tsx src/admin/AdminRouter.test.tsx`; `npm run build`. **Trace**: FR-001–FR-010, FR-013; US1–US5; layout integration with US6 / FR-016.
- [x] **T012 [Frontend] [DONE — scoped local integration verified]** Unit and browser checks verified role/session behavior, route protection, existing destinations, and all eight styled modules at the four required viewports. An independent isolated local run exercised the live Frontend→BFF→Core `/api/v1/auth/me` path with synthetic accounts and no API mocks on that path, including role projection, no-store, unauthorized cases, staff denial without a personnel-list request, shared operational navigation, self-demotion revalidation, logout, and read-only persistence confirmation. This accepts the feature slice, not all eight modules' live CRUD or full Core migration bootstrap. The temporary harness and disposable services/database were removed. **Depends on**: T011, T008, T015. **Checks and limits**: [master verification ledger](../../../specs/014-admin-navigation/quickstart.md). **Trace**: FR-001–FR-017; US1–US6; SC-001–SC-012.

## Future styling tasks

- [x] **T013 [Frontend] [DONE — styling inventory and tests]** Inventoried the eight existing module surfaces, forms, lists, filters, feedback and keyboard/table needs. Added deterministic shell/role/route assertions that failed before implementation; visual preferences and contrast were verified in Chromium rather than simulated as unit-test RED. **Depends on**: T003. **Checks**: Existing panel tests and the local Playwright checks in the [quickstart](../../../specs/014-admin-navigation/quickstart.md). **Trace**: FR-014–FR-017; US6; SC-009–SC-012.
- [x] **T014 [Frontend] [DONE — shared and panel styling]** Applied scoped shared administration styling and local scroll regions to all existing wide tables; preserved Spanish labels, routes, role/CRUD/request behavior, and existing confirmations. Added no dependency, storage, or endpoint. **Depends on**: T013. **Checks**: Panel tests and `npm run build`. **Trace**: FR-014–FR-017; US6; SC-009–SC-012.
- [x] **T015 [Frontend] [DONE — local visual and accessibility verification]** Chromium assertions covered all eight modules and product/promotion/coupon forms at 1280×720, 768×1024, 375×812, and 320×720; no page-wide horizontal overflow or clipped shell was observed. Keyboard focus, current navigation, error feedback, and computed text/boundary/focus contrast were checked. **Depends on**: T014. **Checks**: Local Playwright command and computed contrast evidence are recorded in the [quickstart](../../../specs/014-admin-navigation/quickstart.md). **Trace**: FR-014–FR-017; US6; SC-009–SC-012.

## Frontend execution gates

- Role data must be fetched through the approved BFF design once promoted to canonical contract; never infer privileges from access-token or operation-key presence.
- Keep the role snapshot in memory only. Hide links and protected content while loading, on malformed/error responses, and after logout/session changes or observed authorization denial.
- Frontend controls supplement, but never replace, backend authorization.
- T005 approval is canonicalized by completed BFF T006–T008. T009–T015 are complete; T012 passed scoped local live-service integration using an authorized disposable PostgreSQL database. The test did not certify full CRUD coverage or full Core migration bootstrap.
- The user grants visual discretion to extend current storefront patterns across all eight admin modules. No exact pixels are approved, no mockup sign-off is mandatory, and no new UI/font dependency or design-system architecture is planned. Ask only for a genuine unresolved decision; styling adds no backend contract or persistence.
- No non-local deployment or validation is in scope.

## Key Learnings

1. Admin product, coupon, and user panels already exist, so navigation must reuse their current routes.
2. Current admin route gating checks for a token but does not check the user's role.
