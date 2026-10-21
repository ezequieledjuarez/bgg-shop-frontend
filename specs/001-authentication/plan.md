# Implementation Plan: Customer Authentication (As-Built)

**Branch**: `001-authentication` (retrospective; work landed on the feature branches recorded in the ODD documents) | **Date**: 2026-10-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-authentication/spec.md`

**Note**: Retrospective plan. It documents what the Frontend already implements for CU-C01; it does not propose new behavior.

## Summary

Registration (`/register`) and login (`/login`) screens validate input in the browser and call the BFF REST endpoints `POST /api/v1/auth/register` and `POST /api/v1/auth/login`. A successful login stores the returned session in `sessionStorage` under `bgg-shop.session`, notifies the app, and navigates to the catalog. Logout is local only. Account creation, credential checks, and token issuance stay in the BFF/Core.

## Technical Context

**Language/Version**: TypeScript ~5.4, React 19 (`package.json`)
**Primary Dependencies**: Vite 5, `@vitejs/plugin-react`, `openapi-typescript` (type generation from the BFF OpenAPI)
**Storage**: Browser `sessionStorage` (`bgg-shop.session`); no server state owned by the Frontend
**Testing**: Vitest 1.6, Testing Library, jsdom, MSW (`src/mocks/handlers.ts`, `src/test/setup.ts`)
**Target Platform**: Modern browsers; served by Vite (dev) or static build
**Project Type**: Web application (Frontend repository only; consumes the BFF)
**Performance Goals**: N/A (no goals stated in the spec)
**Constraints**: Frontend talks only to the BFF REST API (`../bgg-shop-bff/specs/openapi.yaml`); user-facing copy is Spanish; no token refresh, expiry handling, or server-side logout
**Scale/Scope**: 2 screens (login, register), 1 session helper module, header navigation in `App.tsx`

## Constitution Check

*GATE: Checked retrospectively against [`.specify/memory/constitution.md`](../../.specify/memory/constitution.md).*

- Own the browser experience: PASS (form validation, session handling, and navigation live in `src/auth/` and `src/App.tsx`).
- Generate API types from the BFF contract: PASS (`RegisterRequest`, `LoginRequest`, `LoginResponse`, `AuthSession` come from `src/types/generated/bff-api.d.ts`).
- Protect browser users and credentials: PARTIAL, as documented in the spec: the session token lives in `sessionStorage`, and there is no expiry or server-side logout.
- Verify user-facing changes: tests exist in `src/auth/AuthScreens.test.tsx`; see [tasks.md](./tasks.md) for evidence status.

## Project Structure

### Documentation (this feature)

```text
specs/001-authentication/
├── spec.md              # As-built functional specification
├── plan.md              # This file
└── tasks.md             # Retrospective task list
```

### Source Code (repository root)

```text
src/
├── App.tsx                         # Routes, header navigation, session-aware account actions
├── auth/
│   ├── AuthScreens.tsx             # LoginScreen, RegisterScreen, validation, BFF calls
│   ├── AuthScreens.test.tsx        # Frontend authentication tests
│   └── session.ts                  # SESSION_STORAGE_KEY, SESSION_CHANGE_EVENT
├── ui/messages.ts                  # Spanish error/feedback copy
├── App.css                         # Authentication screen and header styles
└── types/generated/bff-api.d.ts    # Types generated from the BFF OpenAPI
```

**Structure Decision**: Single Vite/React project. Authentication is a dedicated `src/auth/` module; routing is path-based inside `App.tsx` (no router library).

## Traceability and Evidence

- Root canonical spec: [001-authentication-as-built](../../../specs/001-authentication-as-built/spec.md).
- BFF contract: [`openapi.yaml`](../../../bgg-shop-bff/specs/openapi.yaml) (`registerAccount`, `loginAccount`).
- ODD records: [`derive-project-specs.md`](../../../odd/tasks/derive-project-specs.md), [`regenerate-plan-tasks.md`](../../../odd/tasks/regenerate-plan-tasks.md).
- Consolidated technical record: [`CU-C01-AUTHENTICATION-CHANGES.md`](../../../docs/CU-C01-AUTHENTICATION-CHANGES.md); end-to-end run: [`CU-C01-C03-E2E-VALIDATION.md`](../../../docs/CU-C01-C03-E2E-VALIDATION.md).

## Complexity Tracking

No constitution violations to justify.
