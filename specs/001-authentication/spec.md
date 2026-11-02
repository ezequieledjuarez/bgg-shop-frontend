# Frontend Functional Specification: Customer Authentication (As-Built)

**Input**: CU-C01
**Status**: Closed and validated with exceptions on 2026-10-30, with owner approval.
**Scope**: Registration and login screens, local browser session handling, and authentication navigation. Account creation, credential verification, and server-issued sessions remain BFF/Core responsibilities described in the [canonical CU-C01 specification](../../../specs/001-authentication-as-built/spec.md).

## Frontend responsibilities

| Frontend requirement | Observed UI behavior, BFF request, and evidence |
| --- | --- |
| **FE-C01-001 — Collect and validate registration and login input.** `/register` presents first name, last name, email, password, and password confirmation; `/login` presents email and password. The screen checks required values, a basic email shape, and matching registration passwords before submitting. | `AuthScreens.tsx` implements the forms and field-level errors. The BFF request types are `RegisterRequest` and `LoginRequest` in the generated API types. [Auth screen](../../src/auth/AuthScreens.tsx), [generated types](../../src/types/generated/bff-api.d.ts), [auth screen tests](../../src/auth/AuthScreens.test.tsx). |
| **FE-C01-002 — Submit registration and present its outcome.** Registration sends `POST /api/v1/auth/register` with trimmed name/email values and the password. A successful response displays confirmation and navigates to `/login` after a short delay; the screen does not store a session or automatically sign the new account in. | The endpoint is `registerAccount` in [BFF OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml). The screen uses `RegisterResponse` only as a shape for the response and does not consume a returned session. Duplicate and field errors are presented using the BFF error code/field where available. [Auth screen](../../src/auth/AuthScreens.tsx), [auth messages](../../src/ui/messages.ts), [auth tests](../../src/auth/AuthScreens.test.tsx). |
| **FE-C01-003 — Start a browser session after login.** Login sends `POST /api/v1/auth/login` with email and password and `credentials: include`. When the response contains `session.access_token`, the browser stores the session in `sessionStorage` under `bgg-shop.session`, notifies the app, and navigates to the catalog. The navigation shows account actions and `Mis Compras` while a session is present. | `loginAccount` returns the BFF `LoginResponse`; `AuthSession` and `AuthUser` are in the generated types. The client checks for the access token but does not verify or refresh it. [Auth screen](../../src/auth/AuthScreens.tsx), [session constants](../../src/auth/session.ts), [app navigation](../../src/App.tsx), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [auth tests](../../src/auth/AuthScreens.test.tsx). |
| **FE-C01-004 — Sign out and show request errors.** The frontend calls BFF logout, sends any OpKey, and clears the browser session only after confirmation. Failed login/registration responses and connection failures are shown as user-facing form errors; invalid credentials use a generic message. | The BFF logout route can revoke an OpKey; it does not revoke already-issued JWTs. A failed logout retains the session. [App navigation](../../src/App.tsx), [auth messages](../../src/ui/messages.ts), [OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml), [auth tests](../../src/auth/AuthScreens.test.tsx), [OpKey specification](../../../bgg-shop-core/specs/008-operations-keys-auth/spec.md). |

## Boundaries and observed gaps

- The Frontend validates form shape and presents results; it does not create accounts, check credentials, issue tokens, or decide duplicate-account policy. Those outcomes come from the BFF/Core contract.
- On successful registration, the screen ignores any session value and does not sign in. The generated `RegisterResponse` type permits an optional session, while the current screen behavior remains registration confirmation followed by login.
- Logout requests OpKey revocation when a key exists; already-issued JWTs remain valid. The screens do not establish JWT revocation or token expiry enforcement.
- The Frontend tests cover form rendering, local input validation, registration success, successful login navigation, OpKey logout, and logout failure. They do not assert duplicate-email handling, invalid-credential responses, or token expiry.
- The owner accepted closure without explicit frontend UI assertions for duplicate-email and invalid-credential responses. Those assertions were not run and are not represented as passed.

## Verification evidence

- [Canonical end-to-end CU-C01](../../../specs/001-authentication-as-built/spec.md)
- [BFF OpenAPI](../../../bgg-shop-bff/specs/openapi.yaml) and [generated BFF API types](../../src/types/generated/bff-api.d.ts)
- [Authentication implementation](../../src/auth/AuthScreens.tsx), [session constants](../../src/auth/session.ts), [app navigation](../../src/App.tsx)
- [Frontend authentication tests](../../src/auth/AuthScreens.test.tsx)
- On 2026-10-30, `vitest run src/auth/AuthScreens.test.tsx` passed 11 tests with simulated responses. This does not verify the untested negative UI paths.
