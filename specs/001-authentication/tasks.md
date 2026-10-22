# Tasks: Customer Authentication (As-Built)

**Input**: Design documents from `/specs/001-authentication/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md)

**Tests**: Included; the as-built feature has Frontend tests in `src/auth/AuthScreens.test.tsx`.

**Organization**: Retrospective. Every task is marked complete because the code exists in the repository. Completion of a task is not evidence of verification; the Evidence section lists only results reported by the ODD documents, and anything else is "pending verification".

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup (Shared Infrastructure)

- [x] T001 Configure the Vite/React/TypeScript project in `package.json`, `vite.config.ts`, and `tsconfig.app.json`
- [x] T002 [P] Configure Vitest, Testing Library, and jsdom in `src/test/setup.ts`
- [x] T003 [P] Generate BFF API types into `src/types/generated/bff-api.d.ts` via `npm run generate:types` from `../bgg-shop-bff/specs/openapi.yaml`

## Phase 2: Foundational (Blocking Prerequisites)

- [x] T004 Define session constants `SESSION_STORAGE_KEY` and `SESSION_CHANGE_EVENT` in `src/auth/session.ts`
- [x] T005 [P] Add Spanish authentication feedback copy in `src/ui/messages.ts`
- [x] T006 [P] Add authentication screen and header styles in `src/App.css`

## Phase 3: User Story 1 - Register and log in (Priority: P1) 🎯 MVP

**Goal**: A visitor registers, logs in, and gets a browser session (FE-C01-001..FE-C01-003).

**Independent Test**: Run `src/auth/AuthScreens.test.tsx`.

### Tests

- [x] T007 [P] [US1] Cover form rendering, local validation, registration success, login navigation in `src/auth/AuthScreens.test.tsx`

### Implementation

- [x] T008 [US1] Implement field validation and forms (`validate`, `Field`, `AuthScreen`) in `src/auth/AuthScreens.tsx` (FE-C01-001)
- [x] T009 [US1] Implement `RegisterScreen` calling `POST /api/v1/auth/register`, with confirmation and delayed redirect to `/login` in `src/auth/AuthScreens.tsx` (FE-C01-002)
- [x] T010 [US1] Implement `LoginScreen` calling `POST /api/v1/auth/login` with `credentials: include`, storing `session.access_token` in `sessionStorage` in `src/auth/AuthScreens.tsx` (FE-C01-003)
- [x] T011 [US1] Route `/login` and `/register` and show account actions and `Mis Compras` when a session exists in `src/App.tsx`

## Phase 4: User Story 2 - Sign out and see errors (Priority: P2)

**Goal**: Local logout and user-facing request errors (FE-C01-004).

**Independent Test**: Local logout test in `src/auth/AuthScreens.test.tsx`.

- [x] T012 [US2] Implement local logout (clear `sessionStorage`, restore visitor navigation) in `src/App.tsx`
- [x] T013 [US2] Map BFF error codes and connection failures to form errors in `src/auth/AuthScreens.tsx` and `src/ui/messages.ts`
- [x] T014 [P] [US2] Cover logout in `src/auth/AuthScreens.test.tsx`

## Phase N: Polish & Cross-Cutting Concerns

- [x] T015 [P] Document the as-built behavior in [spec.md](./spec.md) and the retrospective plan in [plan.md](./plan.md)
- [x] T016 Record known gaps (no duplicate-email or invalid-credential assertions, no token expiry, no server-side logout) in [spec.md](./spec.md)

## Evidence (only what the ODD/docs report)

- Frontend spec commit `6a615fdd8e72af7b3c838daca8b83b4d76d844a4` (docs only; structural readback and `git diff --check` PASS per [`derive-project-specs.md`](../../../odd/tasks/derive-project-specs.md)).
- [`CU-C01-AUTHENTICATION-CHANGES.md`](../../../docs/CU-C01-AUTHENTICATION-CHANGES.md) reports: Frontend `npm run test:report` 15 passed, `npm run build` passed, `npm run lint` passed with one pre-existing set-state-in-effect warning.
- [`CU-C01-C03-E2E-VALIDATION.md`](../../../docs/CU-C01-C03-E2E-VALIDATION.md) reports a headless-browser register → login flow on the live stack; Frontend `npm run test -- --run` 17/17 passed.
- Implementation commit for the Frontend authentication code: pending verification (not recorded in the ODD documents).
- Checks for this plan/tasks documentation: see the commit that adds it; no application tests were run for it.

## Dependencies & Execution Order

Phase 1 → Phase 2 → US1 (T007–T011) → US2 (T012–T014) → Polish.
