# Tasks: Manage Users and Permissions (CU-A04) — Frontend

**Master backlog**: [orchestrator tasks](../../../specs/012-manage-users-permissions/tasks.md)
**Branch**: `012-manage-users-permissions`
**Status**: T017–T020 are complete: generated API types, test-first UI tests, the admin user-management panel, and local suite/build checks are complete.
**Scope**: Local environments and disposable test data only.

This document contains only Frontend-owned tasks. IDs, statuses, and dependencies are global and match the master backlog. Cross-repository dependencies refer to master task IDs. Local focused T019 tests, lint, and typecheck passed.

## Frontend-owned tasks

- [x] **T006 [Frontend] [DONE — investigation only]** Inventory admin navigation, existing user search/selection, privilege controls, generated API types, and operational UI visibility for staff and superusers. **Evidence**: `bgg-shop-frontend/src/admin/AdminRouter.tsx` routes existing operational modules and has no user-management route or personnel-selection UI; the existing admin shell is reached via token-presence gating and does not provide authorization. `bgg-shop-frontend/src/admin/audit/AuditPanel.test.tsx` demonstrates the local accessible admin-routing/component-test pattern. No UI or generated type was changed during the investigation. Trace: FR-003–FR-009; US1–US3.
- [x] **T017 [Frontend] [DONE — generated types]** After T010 approves the BFF contract, generate Frontend API types with the existing `npm run generate:types`; do not hand-edit generated contract types. **Evidence**: `npm --prefix bgg-shop-frontend run generate:types` passed with openapi-typescript 7.13.0, adding the two approved admin-user paths/schemas to `src/types/generated/bff-api.d.ts`; generated file diff check passed. No UI behavior changed.
- [x] **T018 [Frontend] [DONE — tests authored, expected RED observed]** After T007 and T017, author deterministic UI tests first for user listing/search/selection, independent privilege controls, grant/revoke and failure states, operational navigation, and no employee-onboarding flow. **Evidence**: `npm --prefix bgg-shop-frontend test -- --run src/admin/users/UserManagementPanel.test.tsx` returned 4 expected failures because `/admin/users` does not yet render the panel/error state. Imports resolved. The frontend session contract does not expose actor roles; tests avoid claiming client-side hiding proves authorization.
- [x] **T019 [Frontend] [DONE — implementation and focused checks passed]** Implement the CU-A04 interface using generated BFF types. Provide user selection and independent privilege updates only after the backend permits listing; preserve visible operational access for staff; clearly distinguish saved from failed changes and never expose credentials or personnel selection data to staff. **Evidence**: focused Vitest passed 4/4; focused ESLint passed with 0 warnings/errors; `tsc -b bgg-shop-frontend/tsconfig.app.json` passed; `git diff --check` passed. T020's later full build also passed. **Depends on**: T018, T012 (Core; master), T015 (BFF; master).
- [x] **T020 [Frontend] [DONE — local suite and build passed]** Run and record remaining applicable Frontend local tests/build checks from T007. **Evidence**: `npm --prefix bgg-shop-frontend test -- --run` passed (22 files, 228 tests); two MSW unhandled-request warnings were emitted. `npm --prefix bgg-shop-frontend run build` passed (TypeScript and Vite). `git -C bgg-shop-frontend diff --check` passed.

## Local integration / browser evidence (T021)

**Observed**: `bash scripts/run-spec012-local-e2e.sh` passed all 8 Chromium scenarios in the isolated local harness: independent staff/superuser flag changes and persistence; staff denial/data hiding with operational access; denial after self-demotion using the same bearer; missing-authentication 401; invalid-bearer 401; fake operation-key-only 403; inactive-valid-bearer 403; and last-active-Superadmin denial with 409 and state unchanged. Cleanup verified the harness-owned Core/BFF/Frontend/Playwright processes exited, its unique tmpfs PostgreSQL container/database were removed, and its temporary run directory was deleted. Full-stack concurrent revocations remain pending; Core service-level concurrency tests are separate and do not replace this case. Trace: spec `specs/012-manage-users-permissions/spec.md` (FR-001–FR-011; SC-001–SC-007); implementation `bgg-shop-core/saleor/graphql/api.py` and `bgg-shop-bff/src/controllers/admin_users_controller.py`; test `bgg-shop-frontend/tests/e2e/admin-users.spec.ts`; harness `scripts/run-spec012-local-e2e.sh`.

## Execution gates

- T006 and T017–T020 are complete. Focused UI checks and the full local Frontend suite/build passed.
- Generate API types from the approved BFF OpenAPI using the existing `npm run generate:types`; never manually author generated contract types.
- Apply test-first sequencing where a deterministic expected result and runnable Frontend test exist. The plan must name exact test files/selectors and commands; use existing Frontend npm test/build tooling.
- Only an active Superadmin sees privilege-management user listing/selection or controls. Staff retains operational module access; hiding controls supplements but never replaces Core and BFF authorization.
- Do not display credentials, secrets, or privilege-management data to staff or public/buyer views. Use disposable local data only; no real personal information in fixtures or documentation.
